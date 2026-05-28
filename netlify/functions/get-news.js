import { getStore } from '@netlify/blobs';

export default async () => {
  const store=getStore('dispatch');
  const data=await store.get('latest',{type:'json'});

  return Response.json(data||{
    dataEngineering:[],
    dataLeadership:[]
  });
};