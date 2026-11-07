import logging

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import DB, CurrentUser
from app.core.config import get_settings
from app.core.errors import AppError, Unauthorized
from app.core.security import hash_password, verify_password
from app.schemas import (
    AuthOut,
    ChangePasswordIn,
    DeleteAccountIn,
    ForgotIn,
    LoginIn,
    Message,
    RegisterIn,
    ResetIn,
    UserOut,
)
from app.services import auth as svc
from app.services.ratelimit import client_ip, limit, limiter

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("failover.auth")


def _out(user, access: str, ttl: int) -> AuthOut:
    return AuthOut(access_token=access, expires_in=ttl, user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=201, dependencies=[Depends(limiter("register", 10, 3600))])
async def register(body: RegisterIn, request: Request, response: Response, db: DB):
    from app.schemas import _TZ  # local import: large set

    tz = body.timezone if body.timezone in _TZ else None
    user = await svc.register(db, body.email, body.password, body.name, tz)
    access, ttl = await svc.issue_session(db, user, response, request.headers.get("user-agent"), client_ip(request))
    await db.commit()
    return _out(user, access, ttl)


@router.post("/login", response_model=AuthOut, dependencies=[Depends(limiter("login", 20, 300))])
async def login(body: LoginIn, request: Request, response: Response, db: DB):
    limit(f"login-email:{body.email.lower()}", 10, 300)
    user = await svc.authenticate(db, body.email, body.password)
    access, ttl = await svc.issue_session(db, user, response, request.headers.get("user-agent"), client_ip(request))
    await db.commit()
    return _out(user, access, ttl)


@router.post("/refresh", response_model=AuthOut, dependencies=[Depends(limiter("refresh", 60, 60))])
async def refresh(request: Request, response: Response, db: DB):
    user, access, ttl = await svc.rotate(db, request.cookies.get(svc.REFRESH_COOKIE), response,
                                         request.headers.get("user-agent"), client_ip(request))
    await db.commit()
    return _out(user, access, ttl)


@router.post("/logout", response_model=Message)
async def logout(request: Request, response: Response, db: DB):
    await svc.revoke(db, request.cookies.get(svc.REFRESH_COOKIE))
    await db.commit()
    svc.clear_refresh_cookie(response)
    return Message(message="Signed out.")


@router.post("/logout-all", response_model=Message)
async def logout_all(user: CurrentUser, response: Response, db: DB):
    await svc.revoke_all(db, user)
    await db.commit()
    svc.clear_refresh_cookie(response)
    return Message(message="Signed out on every device.")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user


@router.post("/forgot-password", response_model=Message, dependencies=[Depends(limiter("forgot", 5, 900))])
async def forgot_password(body: ForgotIn, db: DB):
    raw = await svc.start_reset(db, body.email)
    await db.commit()
    s = get_settings()
    data = None
    if raw and not s.is_production:
        link = f"{s.frontend_url}/reset-password?token={raw}"
        log.warning("DEV password reset link for %s: %s", body.email, link)
        data = {"dev_reset_link": link}
    # same response whether or not the account exists (no user enumeration)
    return Message(message="If an account exists for that email, a reset link is on its way.", data=data)


@router.post("/reset-password", response_model=Message, dependencies=[Depends(limiter("reset", 10, 900))])
async def reset_password(body: ResetIn, response: Response, db: DB):
    await svc.finish_reset(db, body.token, body.password)
    await db.commit()
    svc.clear_refresh_cookie(response)
    return Message(message="Password updated. Sign in with your new password.")


@router.post("/change-password", response_model=AuthOut)
async def change_password(body: ChangePasswordIn, user: CurrentUser, request: Request, response: Response, db: DB):
    limit(f"change-pw:{user.id}", 5, 900)
    if not verify_password(body.current_password, user.password_hash):
        raise Unauthorized("Your current password is incorrect.", code="invalid_credentials")
    if body.current_password == body.new_password:
        raise AppError("Choose a password you haven't used here before.", code="same_password", status=422)
    svc.check_password_policy(body.new_password, user.email)
    user.password_hash = hash_password(body.new_password)
    await svc.revoke_all(db, user)  # signs out other devices
    access, ttl = await svc.issue_session(db, user, response, request.headers.get("user-agent"), client_ip(request))
    await db.commit()
    return _out(user, access, ttl)


@router.delete("/account", response_model=Message)
async def delete_account(body: DeleteAccountIn, user: CurrentUser, response: Response, db: DB):
    if not verify_password(body.password, user.password_hash):
        raise Unauthorized("Password is incorrect.", code="invalid_credentials")
    await db.delete(user)
    await db.commit()
    svc.clear_refresh_cookie(response)
    return Message(message="Your account and all its data have been deleted.")
