const API_URL='/.netlify/functions/get-news';

async function loadNews(){
  const res=await fetch(API_URL);
  const data=await res.json();

  render('engineering',data.dataEngineering||[]);
  render('leadership',data.dataLeadership||[]);
}

function render(id,items){
  const el=document.getElementById(id);

  if(!items.length){
    el.innerHTML='<div class="card">No articles yet.</div>';
    return;
  }

  el.innerHTML=items.map(item=>`
    <div class="card">
      <div><strong>${item.sourceGroup}</strong> · ${item.source}</div>
      <h3><a href="${item.url}" target="_blank">${item.title}</a></h3>
    </div>
  `).join('');
}

async function refreshNews(){
  await fetch('/.netlify/functions/update-news');
  setTimeout(loadNews,2000);
}

loadNews();