// Static historical decorative imagery, fetched through the application so a
// private analyst's IP and investigation context are never sent to NASA.
const SOURCES=[
 // NASA moved the historical NEO archive; use the verified Science asset.
 "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg"
];
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 for(const source of SOURCES){
  try{
   const response=await fetch(source,{
    redirect:"follow",
    next:{revalidate:60*60*24*30},
    signal:AbortSignal.timeout(10000)
   });
   const type=response.headers.get("content-type")?.toLowerCase()??"";
   const size=Number(response.headers.get("content-length")??0);
   if(!response.ok||!type.startsWith("image/")||(size>5_000_000))continue;
   const bytes=await response.arrayBuffer();
   if(!bytes.byteLength||bytes.byteLength>5_000_000)continue;
   return new Response(bytes,{
    headers:{
     "Content-Type":type.startsWith("image/png")?"image/png":"image/jpeg",
     "Cache-Control":"public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
     "X-Content-Type-Options":"nosniff"
    }
   });
  }catch{ /* A failed satellite provider must not disable the vector map. */ }
 }
 return new Response(null,{status:503,headers:{"Cache-Control":"public, max-age=300"}});
}
