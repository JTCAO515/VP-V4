// Synthetic server port inputs only. No real purchase, SKU binding, signature or Apple response.
export const owner='443b36bd-7c43-4be4-9d4a-e58964549055';
export const other='1f83af92-28e3-44f7-a9d9-2b5cd211acb1';
export const now=Date.now();
export const jws='a'.repeat(100)+'.bbbb.cccc';
export const currentJws='b'.repeat(100)+'.dddd.eeee';
export const binding={environment:'Sandbox',approvedProductId:'synthetic.monthly',approvedGroupId:'100',bundleId:'space.go2china.VisePanda'};
export const catalog={schemaVersion:'subscription-development/1',catalogVersion:3,policyVersion:'subscription-development-policy/1',saleState:'development_only',
 products:{subscription:{kind:'auto_renewing',period:{unit:'month',value:1},durationAuthority:'apple_verified_period',storeKitProductId:null,price:null,purchasable:false}},
 serviceTaskCapacity:{subscription:{period:{kind:'per_verified_period',quantity:80},burst:{kind:'account_rolling',hours:24,quantity:12}}}};
export const payload={environment:'Sandbox',bundleId:binding.bundleId,productId:binding.approvedProductId,subscriptionGroupIdentifier:'100',
 transactionId:'1001',originalTransactionId:'1001',type:'Auto-Renewable Subscription',quantity:1,appAccountToken:owner,
 inAppOwnershipType:'PURCHASED',purchaseDate:now-60000,expiresDate:now+240000,signedDate:now-1000,transactionReason:'PURCHASE'};
export function options(device=payload,current=payload){return {catalog,binding,ports:{now:()=>now,verify:async s=>s===jws?device:current,readback:async()=>currentJws}};}
