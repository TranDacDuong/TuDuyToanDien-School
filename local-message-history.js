(function () {
  const PREFIX = '__MINDUP_LOCAL_V1__:';
  const cache = new Map();
  async function hydrate(client, rows) {
    const keys = [...new Set(rows.filter(row=>String(row.content || '').startsWith(PREFIX)).map(row=>row.content.slice(PREFIX.length)))];
    if (!keys.length) return rows;
    const pending = keys.filter(key=>!cache.has(key));
    for (let offset=0;offset<pending.length;offset+=100) {
      const batch=pending.slice(offset,offset+100);
      const request=await client.rpc('request_local_zalo_history',{p_keys:batch});
      if(request.error) throw request.error;
      const deadline=Date.now()+45000;
      let ready=false;
      while(Date.now()<deadline) {
        const result=await client.rpc('read_local_zalo_history',{p_id:request.data});
        if(result.error) throw result.error;
        if(result.data?.status==='ready') {
          for(const row of result.data.items || []) if(batch.includes(row.key) && typeof row.content==='string') cache.set(row.key,row.content);
          ready=true;break;
        }
        if(result.data?.status==='expired') break;
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      if(!ready || batch.some(key=>!cache.has(key))) {
        const error=new Error('Máy lưu trữ của trung tâm đang ngoại tuyến hoặc chưa có lịch sử này. Hãy bật bot rồi thử lại.');
        error.code='LOCAL_HISTORY_UNAVAILABLE';throw error;
      }
    }
    while(cache.size>500) cache.delete(cache.keys().next().value);
    return rows.map(row=>String(row.content || '').startsWith(PREFIX)
      ? {...row,content:cache.get(row.content.slice(PREFIX.length)) || '[Lịch sử đang lưu trên máy trung tâm]'} : row);
  }
  window.LocalMessageHistory={hydrate};
})();
