import { Suspense } from 'react';
import { BriefOpsWorkspace } from './workspace';
export default function BriefOpsPage() {
  return <Suspense fallback={<p role="status">VisePanda · Traveler Brief</p>}><BriefOpsWorkspace /></Suspense>;
}
