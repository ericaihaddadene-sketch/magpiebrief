// Synthetic-only demonstration output derived from Billing Exception Studio's deterministic fixture.
// No file inputs, telemetry, backend calls, financial record intake or payments.
const rows=[
{type:'reconciled',id:'W100',company:'Fictional Engineering A',task:'Field planning',contract:'C100',expected:80000,issued:80000,difference:0,invoices:'INV100'},
{type:'underbilled',id:'W101',company:'Fictional Engineering A',task:'Change review',contract:'C100',expected:40000,issued:25000,difference:15000,invoices:'INV101'},
{type:'unbilled',id:'W102',company:'Fictional Engineering A',task:'Implementation support',contract:'C100',expected:60000,issued:0,difference:60000,invoices:'none'},
{type:'excluded',id:'W103',company:'Fictional Engineering A',task:'Awaiting approval',contract:'C100',expected:null,issued:0,difference:null,invoices:'none'},
{type:'pending',id:'W104',company:'Fictional Studio B',task:'Design workshop (draft)',contract:'C200',expected:22500,issued:0,difference:22500,invoices:'INV104 (draft)'},
{type:'review',id:'W105',company:'Fictional Engineering A',task:'No rate card',contract:'C999',expected:null,issued:0,difference:null,invoices:'none'},
{type:'excluded',id:'W106',company:'Fictional Engineering A',task:'Nonbillable planning',contract:'C100',expected:null,issued:0,difference:null,invoices:'none'},
{type:'overbilled',id:'W107',company:'Fictional Engineering A',task:'Quality assurance',contract:'C100',expected:40000,issued:48000,difference:-8000,invoices:'INV107'}
];
const label={reconciled:'Matched',underbilled:'Underbilled',unbilled:'Not invoiced',pending:'Draft pending',excluded:'Excluded',review:'Rate review',overbilled:'Overbilled'};
const money=n=>n==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2,minimumFractionDigits:2}).format(n/100);
const body=document.getElementById('findings'),filter=document.getElementById('filter');
function cell(text,klass){const td=document.createElement('td');td.textContent=text;if(klass)td.className=klass;return td;}
function render(){const selection=filter.value;const shown=rows.filter(r=>selection==='all'||(selection==='action'&&['underbilled','unbilled'].includes(r.type))||(selection==='review'&&['review','overbilled'].includes(r.type))||r.type===selection);body.replaceChildren();
if(!shown.length){const tr=document.createElement('tr');const td=cell('No fictional records match this filter.');td.colSpan=5;tr.append(td);body.append(tr);return;}
for(const item of shown){const tr=document.createElement('tr');const id=cell('');const strong=document.createElement('div');strong.className='record';strong.textContent=item.id+' · '+item.company;const sub=document.createElement('div');sub.className='meta';sub.textContent=item.task+' · '+item.contract+' · '+item.invoices;id.append(strong,sub);tr.append(id);const state=cell('');const badge=document.createElement('span');badge.className='status '+item.type;badge.textContent=label[item.type];state.append(badge);tr.append(state);tr.append(cell(money(item.expected),'numeric'));tr.append(cell(money(item.issued),'numeric'));tr.append(cell(money(item.difference),'numeric'));body.append(tr);}}
filter.addEventListener('change',render);render();
const escapeCsv=v=>{const s=String(v??'');const safe=/^[=+@-]/.test(s.trimStart())?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';};
document.getElementById('download').addEventListener('click',()=>{
 const headers=['record_id','fictional_company','work_description','contract_id','category','expected_usd','issued_usd','difference_usd','invoice_reference','synthetic_only'];
 const all=rows.map(r=>[r.id,r.company,r.task,r.contract,label[r.type],r.expected==null?'':(r.expected/100).toFixed(2),(r.issued/100).toFixed(2),r.difference==null?'':(r.difference/100).toFixed(2),r.invoices,'YES']);
 const csv=[headers,...all].map(row=>row.map(escapeCsv).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='fictional-billing-exception-findings.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
