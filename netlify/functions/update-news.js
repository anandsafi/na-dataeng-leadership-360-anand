import Parser from 'rss-parser';
import { getStore } from '@netlify/blobs';

export const config = {
  schedule: '0 */6 * * *'
};

const parser=new Parser();

const SOURCES=[
  {
    group:'Medium',
    category:'Data Engineering',
    url:'https://medium.com/feed/tag/data-engineering'
  },
  {
    group:'Substack',
    category:'Data Leadership',
    url:'https://locallyoptimistic.substack.com/feed'
  },
  {
    group:'Other',
    category:'Data Leadership',
    url:'https://www.nicolaaskham.com/blog?format=rss'
  }
];

async function fetchFeed(source){
  try{
    const feed=await parser.parseURL(source.url);

    return (feed.items||[]).map(item=>({
      title:item.title||'',
      url:item.link||'',
      source:feed.title||source.group,
      sourceGroup:source.group,
      category:source.category
    }));
  }catch(e){
    return [];
  }
}

export default async ()=>{
  const results=(await Promise.all(SOURCES.map(fetchFeed))).flat();

  const payload={
    generatedAt:new Date().toISOString(),
    dataEngineering:results.filter(x=>x.category==='Data Engineering').slice(0,25),
    dataLeadership:results.filter(x=>x.category==='Data Leadership').slice(0,25)
  };

  const store=getStore('dispatch');
  await store.setJSON('latest',payload);

  return Response.json({ok:true,count:results.length});
};