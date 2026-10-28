// Historical NASA Blue Marble is proxied from our server: no user's browsing context
// or investigation identifiers are sent to the imagery host.
export const runtime="nodejs";
export const dynamic="force-dynamic";
const SOURCES=[
 "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg"
] as const;
export async function GET(){
 for(const url of SOURCES){
  try{
   const response=await fetch(url,{next:{revalidate:60*60*24*30},signal:AbortSignal.timeout(12000)});
   const contentType=response.headers.get("content-type")?.toLowerCase()??"";
   const length=Number(response.headers.get("content-length")??0);
   if(!response.ok||!contentType.startsWith("image/jpeg")||length>4_000_000)continue;
   const bytes=await response.arrayBuffer();
   if(!bytes.byteLength||bytes.byteLength>4_000_000)continue;
   return new Response(bytes,{headers:{
    "Content-Type":"image/jpeg",
    "Cache-Control":"public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
    "X-Content-Type-Options":"nosniff"
   }});
  }catch{/* The SVG geographic hit targets work without remote imagery. */}
 }
 return new Response(null,{status:503,headers:{"Cache-Control":"public, max-age=300"}});
}
