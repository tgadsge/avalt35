import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/app.js',import.meta.url),'utf8');
const route=source.slice(source.indexOf('function routeFromUrl(){'),source.indexOf("window.addEventListener('popstate'"));
test('Telegram launch fragment preserves query product and subsequent navigation',()=>{
 let url=new URL('https://store.example/?watch=W-0149#tgWebAppData=example');let page;
 const ctx=vm.createContext({URL,location:{get href(){return url.href},get hash(){return url.hash}},history:{replaceState(_a,_b,next){url=new URL(next,url)}},products:new Map([['W-0149',{}]]),renderProduct(){},setPage(value){page=value}});
 vm.runInContext(route+';routeFromUrl()',ctx);
 assert.equal(page,'product');assert.equal(ctx.currentProduct,'W-0149');assert.equal(url.hash,'#watch/W-0149');assert.equal(url.search,'');
 url.hash='home';vm.runInContext('routeFromUrl()',ctx);assert.equal(page,'home');
 url.hash='watch/W-0149';vm.runInContext('routeFromUrl()',ctx);assert.equal(page,'product');
});
test('unknown product query does not open a nonexistent watch',()=>{
 let url=new URL('https://store.example/?watch=W-9999#tgWebAppData=example');let page;
 const ctx=vm.createContext({URL,location:{get href(){return url.href},get hash(){return url.hash}},history:{replaceState(_a,_b,next){url=new URL(next,url)}},products:new Map(),renderProduct(){throw Error('Unexpected product')},setPage(value){page=value}});
 vm.runInContext(route+';routeFromUrl()',ctx);assert.equal(page,'home');assert.equal(url.search,'');
});
