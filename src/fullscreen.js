// Phones: go full screen on the first tap (browsers only allow it from a gesture) once; respect a later user exit.
// iPhone Safari has no Fullscreen API for pages, so it gets a one-off "Add to Home Screen" hint; the manifest and meta tags make that launch full screen.
export function autoFullscreen(onIosHint){
 const root=document.documentElement,request=root.requestFullscreen||root.webkitRequestFullscreen,
  active=()=>document.fullscreenElement||document.webkitFullscreenElement,
  standalone=navigator.standalone||matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
 if(standalone)return;
 if(!request){if(/iPhone|iPod/.test(navigator.userAgent))addEventListener('pointerup',()=>onIosHint?.(),{once:true});return;}
 const enter=()=>{if(active())return;try{Promise.resolve(request.call(root,{navigationUI:'hide'})).catch(()=>{});}catch{}};
 addEventListener('pointerup',enter,{capture:true,passive:true,once:true});
}
export function toggleFullscreen(){
 const d=document,root=d.documentElement;
 if(d.fullscreenElement||d.webkitFullscreenElement)return (d.exitFullscreen||d.webkitExitFullscreen)?.call(d);
 return Promise.resolve((root.requestFullscreen||root.webkitRequestFullscreen)?.call(root,{navigationUI:'hide'})).catch(()=>{});
}
