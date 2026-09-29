import { DiscoveryWorkbench } from "@/components/techint/discovery-workbench";
import { globalRangeSchema } from "@/lib/baykush-node/range";
import { getNodeComposition,getNodeConvergence,getNodeGeographyMap,getNodeNewEntities,getNodeTopMovers } from "@/lib/baykush-node/queries";
import { requireUser } from "@/lib/auth";

export default async function Page({searchParams}:{searchParams:Promise<{range?:string}>}){
  await requireUser();
  const query=await searchParams;
  const range=globalRangeSchema.catch('24h').parse(query.range);
  const [convergence,newEntities,composition,topMovers,geography]=await Promise.allSettled([
    getNodeConvergence(range),getNodeNewEntities(range),getNodeComposition(range),getNodeTopMovers(range),getNodeGeographyMap(range),
  ]);
  return <DiscoveryWorkbench
    range={range}
    convergence={convergence.status==='fulfilled'?convergence.value.data:undefined}
    newEntities={newEntities.status==='fulfilled'?newEntities.value.data:undefined}
    composition={composition.status==='fulfilled'?composition.value.data:undefined}
    topMovers={topMovers.status==='fulfilled'?topMovers.value.data:undefined}
    geography={geography.status==='fulfilled'?geography.value.data:undefined}
    convergenceUnavailable={convergence.status==='rejected'}
    newEntitiesUnavailable={newEntities.status==='rejected'}
    compositionUnavailable={composition.status==='rejected'}
    topMoversUnavailable={topMovers.status==='rejected'}
    geographyUnavailable={geography.status==='rejected'}
  />;
}
