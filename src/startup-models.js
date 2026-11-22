async function loadWithRetry(file,load){
 try{return await load(file);}
 catch(error){
  const status=error.response?.status;
  const interrupted=error instanceof TypeError||status===408||status===429||status>=500;
  if(!interrupted)throw error;
  return load(file);
 }
}

// Keep large GLBs from competing for bandwidth on a cold Pages visit.
export async function loadStartupModels(files,load,onProgress){
 const models=new Map(),queue=[...new Set(files)],total=queue.length;
 let next=0,failed=false;
 async function worker(){
  while(!failed&&next<total){
   const file=queue[next++];
   try{
    const model=await loadWithRetry(file,load);
    models.set(file,model);
    onProgress(models.size,total);
   }catch(error){
    failed=true;
    throw new Error(`Could not load ${file.split('/').pop()}: ${error.message}`,{cause:error});
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(6,total)},worker));
 return models;
}

// Two optional assets at a time. A failed detail leaves the running simulation available.
export async function streamSceneDetails(details,load){
 let next=0;
 async function worker(){
  while(next<details.length){
   const {file,install}=details[next++];
   try{
    const model=await loadWithRetry(file,load);
    await new Promise(requestAnimationFrame);
    await install(model);
   }catch(error){console.warn('Could not stream '+file,error);}
  }
 }
 await Promise.all([worker(),worker()]);
}
