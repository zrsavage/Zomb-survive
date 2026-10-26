const r=require(process.argv[2]); let t=0,b=0,l=0,n=0; for(const x of r){t+=x.t;b+=x.beaten||0;l+=x.level;n++;}
console.log('n',n,'avg t',(t/n)|0,'avg beaten',(b/n).toFixed(1),'avg lvl',(l/n).toFixed(2),'survived',r.filter(x=>!x.over).length, 'errs', r.reduce((a,x)=>a+(x.errors||[]).length,0));
