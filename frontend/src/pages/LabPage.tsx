import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import LabWorkspace from '@/components/lab/LabWorkspace'

export default function LabPage() {
  const { slug } = useParams()
  useEffect(() => {
    const prev = document.title
    return () => {
      document.title = prev
    }
  }, [])
  return <LabWorkspace key={slug} mode="lab" slug={slug} />
}
