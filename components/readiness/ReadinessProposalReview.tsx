"use client";
import {useEffect,useRef,useState} from "react";
import {TripContentEditor,type LocalTripRead} from "@/components/canvas/TripContentEditor";
import type {PendingProposalRead} from "@/lib/server/identity/user-data-adapter";
export function ReadinessProposalReview({tripId,proposalId,proposalRevision,proposalDigest,locale,onChanged}:{
 tripId:string;proposalId:string;proposalRevision:number;proposalDigest:string;locale:"zh"|"en";onChanged:()=>void;
}){
 const [data,setData]=useState<LocalTripRead|null>(null),[pending,setPending]=useState<PendingProposalRead|null>(null),[unavailable,setUnavailable]=useState(false);
 const live=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();live.current=true;setData(null);setPending(null);setUnavailable(false);
  void(async()=>{try{
   const [trip,proposal]=await Promise.all([fetch("/api/trips/"+tripId,{cache:"no-store",signal:controller.signal}),fetch("/api/trips/"+tripId+"/proposal?"+new URLSearchParams({proposalId}),{cache:"no-store",signal:controller.signal})]);
   if(!trip.ok||!proposal.ok)throw Error("Unavailable");
   const current=await trip.json() as LocalTripRead,selected=await proposal.json() as PendingProposalRead;
   if(current.trip.id!==tripId||selected.trip.id!==tripId||selected.proposal.id!==proposalId||selected.proposal.revision!==proposalRevision
    ||selected.proposal.digest!==proposalDigest||selected.proposal.stale||selected.proposal.baseTripVersion!==current.trip.headVersion)throw Error("Changed exact proposal");
   if(controller.signal.aborted)return;setData(current);setPending(selected);
  }catch{if(!controller.signal.aborted)setUnavailable(true);}})();
  return ()=>{live.current=false;controller.abort();};
 },[tripId,proposalId,proposalRevision,proposalDigest]);
 async function reload(){
  const response=await fetch("/api/trips/"+tripId,{cache:"no-store"});if(!response.ok||!live.current)return null;
  const current=await response.json() as LocalTripRead;if(current.trip.id!==tripId||!live.current)return null;
  setData(current);setPending(null);onChanged();return current;
 }
 if(unavailable)return <p role="status">{locale==="zh"?"这份精确提案或权限已变化，请重新核验准备动作。":"The exact proposal or permission changed. Recheck the preparation action."}</p>;
 return data&&pending?<TripContentEditor data={data} pending={pending} locale={locale} onReload={reload} onPending={setPending}/>:null;
}
