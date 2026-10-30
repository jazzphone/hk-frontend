class HkControlCard extends HTMLElement{static get observedAttributes(){return["size"]}attributeChangedCallback(name,was,now){if(name!=="size"||was===now||!this._config||!this.client)return;this._signature="";if(this._dragging){this._deferred=true;return}this._render()}setConfig(config){if(!config||!(config.entity||config.entity_from))throw new Error("hk-control-card requires an entity or an entity_from");this._config=config;if(!this.shadowRoot)this.attachShadow({mode:"open"});this._signature=""}_entityId(){const ef=this._config.entity_from;if(ef&&ef.music&&window.hkMusic){return window.hkMusic.player(this.client)||null}if(ef&&ef.selector){const sel=this.client?.states?.[ef.selector]?.state;const mapped=ef.map&&sel!=null?ef.map[sel]:null;if(mapped)return mapped}return this._config.entity}connectedCallback(){if(super.connectedCallback)super.connectedCallback();if(window.hkCards&&window.hkCards.place){window.hkCards.place(this);if(window.hkCards.flatSurface)window.hkCards.flatSurface(this,"control");if(this.client&&window.hkCards.tone)window.hkCards.tone(this,this.client)}if(this._config&&this._config.bare)return;if(window.__hkGlassCards){window.__hkGlassCards.add(this);if(window.hkGlass)window.hkGlass.changed(this,true)}}disconnectedCallback(){if(super.disconnectedCallback)super.disconnectedCallback();if(window.__hkGlassCards&&window.__hkGlassCards.delete(this)&&window.hkGlass){window.hkGlass.changed(this,false)}}_actions(){const c=this.client;return c?c.actions:null}_svc(...args){const act=this._actions();if(!act)return Promise.reject(new Error("not connected"));return act.callService(...args)}_onClient(client){if(!client)return;if(window.hkCards&&window.hkCards.tone)window.hkCards.tone(this,client);const id=this._entityId();const s=client.states[id];const signature=JSON.stringify([id,s?.state,s?.attributes,window.hkSettings?.rendering?.()]);if(signature!==this._signature){this._signature=signature;if(this._dragging){this._deferred=true;return}this._render()}}getCardSize(){return this._domain()==="climate"?5:2}_domain(){return this._config.control||String(this._entityId()||"").split(".")[0]}_state(){return this.client?.states?.[this._entityId()]}_name(){return this._config.name||this._state()?.attributes?.friendly_name||this._entityId()}_esc(v){return window.hkCards.esc(v)}_pretty(v){const map={heat_cool:"Auto",heat:"Heat",cool:"Cool",off:"Off",auto:"Auto",on:"On",none:"None",time_of_use:"Time of Use",self_powered:"Self Powered",scheduled:"Scheduled",high_demand:"High Demand",heat_pump:"Heat Pump",electric:"Electric",eco:"Eco",open:"Open",closed:"Closed"};return map[v]||String(v??"Unavailable").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}_valueText(v,unit){if(unit==="W"&&Number.isFinite(v)&&Math.abs(v)>=1e3)return`${String(Math.round(v/100)/10)} kW`;return`${Number(v).toLocaleString()} ${unit}`}_rangeText(min,max,unit){const lo=Number(min),hi=Number(max);if(unit==="W"&&Number.isFinite(lo)&&Number.isFinite(hi)&&hi>=1e3){const kw=v=>String(Math.round(v/100)/10);return`${kw(lo)}–${kw(hi)} kW`}return`${min}–${max} ${unit}`}_icon(domain){if(this._config&&this._config.icon)return this._config.icon;return{select:"mdi:calendar-sync",number:"mdi:tune-variant",switch:"mdi:power",valve:"mdi:water-pump",water_heater:"mdi:water-boiler"}[domain]||"mdi:home"}_accent(){var c=this._config&&this._config.color;if(!c)return null;return window.hkCards.PALETTE.accent[String(c).toLowerCase().trim()]||c}_tallPx(){var C=window.hkCards;return(C&&C.TILE?C.TILE.tall:152)+"px"}_baseCss(){const M=window.hkCards.M;return`
      /* a tile in a grid: its cell's width (100% here is the grid AREA,
         without the 4 px margins every grid child has, so it ran 8 px wide) */
      :host([data-tilel]){width:auto}
      :host{display:block;width:100%;box-sizing:border-box;font-family:var(--paper-font-body1_-_font-family,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif)}
      *{box-sizing:border-box}
      .surface{width:100%;color:${window.hkCards.v("ink")};${window.hkCards.plate("panel")};overflow:hidden}
      .media-bare.off,.surface.off{opacity:.35;pointer-events:none}
      .surface.bare{background:none;border:0;box-shadow:none;border-radius:0;padding-left:0;padding-right:0;overflow:visible}
      .surface.bare .head,.surface.bare .tstat-name,.surface.bare .tstat-sub{display:none}
      .surface.bare.tstat{padding:0}
      .head{display:flex;align-items:center;gap:12px;min-width:0}
      /* the name and the value 8 px apart, not 12: three sliders across a
         932 px page left "Charging Speed" 3 px short beside "2.5 kW" */
      .head .titles{margin-right:-4px}
      .glyph{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--hk-accent,rgba(255,159,10,.96));flex:0 0 42px;line-height:0}.glyph hk-icon{display:block;line-height:0}
      .glyph hk-icon{width:23px;height:23px;--mdc-icon-size:23px;color:white}
      .titles{min-width:0;flex:1}
      .name{font-size:17px;line-height:1.12;font-weight:720;letter-spacing:-.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sub{font-size:12.5px;line-height:1.2;font-weight:540;color:${window.hkCards.v("ink-2")};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      button{font:inherit;color:${window.hkCards.v("ink")};border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
      button:active{transform:scale(.96);filter:brightness(.92)}
      .segment{height:46px;border-radius:14px;background:${window.hkCards.v("key")};font-size:13px;font-weight:680;padding:0 12px;transition:.15s ease}
      .segment.active{background:var(--hk-accent,rgba(255,159,10,.96));color:#fff;box-shadow:0 5px 14px rgba(255,130,0,.23)}
      .segments{display:grid;gap:8px}
    `}_segCss(){const C=window.hkCards;if(!C||!C.segCss)return"";return C.segCss(".option-row:not(.many)",{on:".active",fill:true,font:"13px"})+".option-row.many{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}.option-row.many .segment{height:40px;border-radius:20px;background:"+window.hkCards.v("key")+";font-size:13px;font-weight:600;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.option-row.many .segment.active{background:#fff;color:#1c1c1e;box-shadow:none}"+C.segCss(".tstat-modes",{on:".active",fill:true,font:"var(--hk-tstat-seg-font,12.5px)"})+C.segCss(".tstat-fan",{on:".active",fill:true,font:"var(--hk-tstat-fan-font,11.5px)"})+".option-row .segment,.tstat-modes .segment,.tstat-fan .segment{transform:none;filter:none}"}_render(){if(!this.client||!this._config)return;const C=window.hkCards;if(!C||!C.register){if(!this._waitCards){this._waitCards=true;window.addEventListener("hk-cards-ready",()=>{this._waitCards=false;this._render()},{once:true})}return}const domain=this._domain(),s=this._state();let body="";if(domain==="climate"){body=this._climate(s);body=body.replace('<div class="surface','<hk-plate class="surface').replace(/<\/div>\s*$/,"</hk-plate>")}else if(domain==="number")body=this._number(s);else if(domain==="select")body=this._select(s);else if(domain==="switch")body=this._switch(s);else if(domain==="valve")body=this._valve(s);else if(domain==="water_heater")body=this._waterHeater(s);else if(domain==="media_player")body=this._media(s);else body=`<div class="surface compact"><div class="name">${this._esc(this._name())}</div><div class="sub">Unsupported control</div></div>`;if(this._config.bare&&domain!=="media_player")body=body.replace('class="surface','class="surface bare');if(domain!=="media_player")this._prog=null;const HC=window.hkCards,SEGS=".option-row:not(.many),.tstat-modes,.tstat-fan",ON=".segment.active";const before=HC&&HC.segBefore?HC.segBefore(this.shadowRoot,SEGS,ON):null;this.shadowRoot.innerHTML=`<style>${this._baseCss()}${this._extraCss()}${this._segCss()}${HC?.flatCss?HC.flatCss():""}</style>${body}`;if(before&&HC.segAfter)HC.segAfter(this.shadowRoot,SEGS,ON,before);this._progRun();var _a=this._accent();if(_a)this.style.setProperty("--hk-accent",_a);else this.style.removeProperty("--hk-accent");this._bind();if(window.hkGlass)window.hkGlass.rendered(this)}_progRun(){if(this._progAnim){try{this._progAnim.cancel()}catch(e){}this._progAnim=null}const P=this._prog,f=P&&this.shadowRoot&&this.shadowRoot.querySelector&&this.shadowRoot.querySelector(".prog-fill");if(!f||typeof f.animate!=="function")return;if(window.hkSettings?.rendering?.().flat)return;try{if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(e){}const an=f.animate([{transform:"translateX(-100%)"},{transform:"translateX(0)"}],{duration:P.dur*1e3,easing:`steps(${Math.max(1,Math.ceil(P.dur*4))})`});an.currentTime=Math.min(P.dur*1e3,P.pos*1e3+(Date.now()-P.at));this._progAnim=an}_extraCss(){return`
      /* NO BACKTICKS IN THIS BLOCK. _extraCss() and _baseCss() are template
         literals, so a backtick in prose here terminates the string and the
         whole module fails to parse -- the cards render as red error boxes with
         no message anywhere. Quote code with plain quotes.

         HOME APP THERMOSTAT. An open-bottom 270-degree ring with the comfort
         band drawn between the two setpoints, the reading in the middle, and
         the mode row underneath -- which is what the Home app shows and what
         HA's own thermostat card does not.
         touch-action:pan-y, NOT none. With the default a tablet weighs the
         first few pixels as a possible page scroll and the handle lags, which
         argues for none -- but none means the ELEMENT claims every gesture, so
         a vertical scroll that starts anywhere on a 300x258 dial drags a
         setpoint instead of scrolling the page. Stacked sliders have the same
         bug on a smaller target.

         pan-y reserves only the VERTICAL axis for the page. A gesture that
         starts with any horizontal component is still the ring's immediately,
         with no lag -- and once the browser has awarded it, the ring receives
         the whole 2D path including vertical, so a circular drag works
         normally. What is given up is starting an adjustment with a dead
         straight vertical stroke; that scrolls, which is the right answer
         far more often than it is the wrong one. */
      .tstat{padding:20px 20px 16px;display:flex;flex-direction:column;align-items:center;gap:2px}
      /* The grid dial shares the card's insets. Its face stays inside the
         open centre, and the modes anchor to the foot rather than floating. */
      :host([size]){height:100%;--hk-tstat-val:clamp(22px,calc(var(--hk-tstat-ring) * .15),36px)}
      :host([size]) .surface.tstat{height:100%;padding:${window.hkCards.CARD.pad};padding-bottom:calc(20px + var(--hk-pager-safe,0px));gap:0;align-items:stretch}
      :host([size]) .tstat-name{${window.hkCards.typeCss("headline")};text-align:left;line-height:21px}
      :host([size]) .tstat-sub{${window.hkCards.typeCss("caption")};line-height:18px;margin-top:4px;white-space:normal;text-align:left}
      :host([size]) .tstat-wrap{align-self:center;flex:none;margin:auto 0}
      :host([size]) .tstat-val{white-space:nowrap;letter-spacing:-.6px}
      :host([size]) .tstat-cap{${window.hkCards.typeCss("micro")};letter-spacing:.3px}
      :host([size]) .tstat-act{${window.hkCards.typeCss("micro")};margin-top:4px}
      :host([size]) .tstat-face{bottom:auto;height:100%;padding-top:8px}
      :host([size]) .ring .hit{stroke-width:64px}
      :host([size]) .tstat-modes{margin-top:10px;flex:none}
      :host([size]) .tstat-fan{display:none}
      /* T (one column, two rows): the DIAL is the block. The name is its
         heading and the way to the full sheet ("Main Floor ›", as a room
         block's name is), the reading one line under it, and the ring as
         wide as the block -- into the side insets -- with the setpoint the
         largest type on it. The mode is said on the face, not a button. */
      :host([size=T]){--hk-tstat-ring:min(100cqw - 20px, (100cqh - 64px - var(--hk-pager-safe,0px)) * 1.163);
        --hk-tstat-val:clamp(26px,calc(var(--hk-tstat-ring) * .17),42px)}
      :host([size=T]) .tstat-modes{display:none}
      :host([size=T]) .tstat-name{all:unset;position:relative;display:flex;align-items:center;gap:5px;min-width:0;max-width:100%;
        cursor:pointer;-webkit-tap-highlight-color:transparent;${window.hkCards.typeCss("headline")};line-height:21px;color:${window.hkCards.v("ink")}}
      :host([size=T]) .tstat-name span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      :host([size=T]) .tstat-name i{font-style:normal;opacity:.62;flex:none}
      :host([size=T]) .tstat-name::after{content:"";position:absolute;left:-6px;right:-6px;top:-12px;bottom:-12px}
      :host([size=T]) .tstat-name:focus-visible{outline:2px solid ${window.hkCards.v("ink-2")};outline-offset:4px;border-radius:${window.hkCards.R.small}px}
      :host([size=T]) .tstat-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      :host([size=T]) .tstat-wrap{align-self:center;width:var(--hk-tstat-ring);max-width:none}
      :host([size=T]) .tstat-face{padding-top:4px}
      :host([size=T]) .tstat-act{${window.hkCards.typeCss("caption")};margin-top:2px}
      :host([size=L]){--hk-tstat-ring:min(100cqw - 44px, (100cqh - 138px - var(--hk-pager-safe,0px)) * 1.163)}
      .tstat-name{font-size:19px;font-weight:730;letter-spacing:-.4px;text-align:center;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .tstat-sub{font-size:13.5px;font-weight:560;color:${window.hkCards.v("ink-2")};margin-top:2px}
      .ring{width:100%;max-width:var(--hk-tstat-ring,300px);touch-action:pan-y;user-select:none;cursor:pointer;display:block;margin:2px 0 0}
      .ring .hit{fill:none;stroke:transparent;stroke-width:54px;stroke-linecap:round}
      .ring .trk{fill:none;stroke:${window.hkCards.v("line-strong")};stroke-width:22px;stroke-linecap:round}
      :host([hk-flat="light"]) .ring .trk{stroke:${window.hkCards.v("key")}}
      .ring .bnd{fill:none;stroke-width:22px;stroke-linecap:round}
      .ring .kn{fill:#fff;stroke:rgba(0,0,0,.18);stroke-width:1px}
      .ring .cur{fill:${window.hkCards.v("ink")}}
      /* The centre block is HTML over the SVG rather than <text>: it needs the
         same font stack and tabular figures as the rest of the dashboard, and
         SVG text does not inherit either reliably inside a shadow root. */
      .tstat-face{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;
        flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
      .tstat-wrap{position:relative;width:100%;max-width:var(--hk-tstat-ring,300px)}
      /* The --hk-tstat-* variables let a host size the dial and its rows (the
         detail sheet's wide thermostat fills a 400 px column); unset, every
         value is what it always was. */
      .tstat-cap{font-size:11px;font-weight:730;letter-spacing:1.1px;text-transform:uppercase;
        color:${window.hkCards.v("ink-2")}}
      .tstat-val{font-size:var(--hk-tstat-val,46px);font-weight:600;letter-spacing:-2px;line-height:1.04;
        font-variant-numeric:tabular-nums;margin-top:2px}
      .tstat-act{font-size:13px;font-weight:680;margin-top:4px}
      .tstat-modes{width:100%;margin-top:var(--hk-tstat-gap,14px)}
      /* The SELECTED pill is a solid white plate with dark text, which is the
         selection language every other pill on these dashboards uses
         (segments, area toggles, the Speakers row). An inherited
         --hk-accent orange would make Auto shout, and worse, "selected" would
         be a different colour here than three inches away on the same page. */

      /* Fan is secondary to mode, and looks like a peer at full segment size --
         two enormous pills under four smaller ones. */
      .tstat-fan{margin-top:var(--hk-tstat-fan-gap,6px);width:100%}
      /* THE RING ALONE (--hk-tstat-rows: none, 2026-10-24): a sheet on a short
         screen draws the modes and the fan in its own column, beside the ring */
      .surface.tstat .tstat-modes,.surface.tstat .tstat-fan{display:var(--hk-tstat-rows, flex)}
      .compact{padding:17px 18px;min-height:118px}
      /* layout: tile -- the Energy page's plate: a tall tile's height
         (hk-base.js TILE.tall), its 20/22 insets, the slider resting 24 px
         above the bottom (the EcoFlow page) */
      .compact.tilel{box-sizing:border-box;height:${this._tallPx()};padding:20px 22px 24px;display:flex;flex-direction:column}
      .compact.tilel .range-wrap{margin-top:auto;padding:0 2px}
      .compact .glyph{width:38px;height:38px;flex-basis:38px}.compact .glyph hk-icon{width:21px;height:21px;--mdc-icon-size:21px}
      .value{font-size:21px;font-weight:720;letter-spacing:-.35px;margin-left:auto;white-space:nowrap}
      .range-wrap{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;margin-top:14px;touch-action:pan-y;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .prog-track{height:6px;border-radius:4px;background:${window.hkCards.v("line-strong")};overflow:hidden;margin:2px 0 7px}
      /* THE FILL SLIDES IN, IT DOES NOT GROW: full width, moved by a transform
         (the track's overflow clips it; its rounded right end is its own).
         Animating width laid the page out again every frame -- 60 style
         recalcs and layouts a second for as long as music played (measured
         headless: 301 in 3 s; a transform, none). Its STEPS are a quarter
         second each: the edge moves by about a pixel per step, so it reads
         as smooth, and the compositor draws a frame only when a step changes
         -- 4 a second, where a linear transform still drew 60. */
      .prog-fill{width:100%;height:100%;border-radius:4px;background:var(--hk-accent,${window.hkCards.v("track-fill")})}
      .prog-times{display:flex;justify-content:space-between;font-size:12px;font-weight:600;
        letter-spacing:.2px;color:${window.hkCards.v("ink-2")};margin-bottom:4px;font-variant-numeric:tabular-nums}
      /* appearance:none ON THE INPUT, not just on the thumb.
         Without it the engine still draws its NATIVE slider (that is what
         accent-color paints) and then paints our ::-webkit-slider-runnable-track
         on top -- two tracks, which shows as a dark rim around the bar.
         It is also why the thumb can sit correctly in desktop Chrome and visibly
         low in an Android WebView: the thumb's margin-top is measured against
         the track box, and the two engines disagree about what that box is
         until the native appearance is off. Nothing here is per-platform;
         turning the native widget off makes both deterministic.
         No accent-color either -- it only ever affects the native one. */
      /* touch-action:pan-y IS THE FIX FOR "SCROLLING MOVES THE SLIDER": a
         scroll that happens to catch a slider must not move it.

         A native range's UA touch-action is 'manipulation', which means the
         ELEMENT claims every drag -- so a vertical scroll that happens to
         start on the track is a horizontal-slider drag as far as the browser
         is concerned, and the value moves. On a page of stacked controls that
         is most of the screen.

         'pan-y' hands VERTICAL panning back to the page and keeps everything
         else for the element: a vertical drag scrolls and never touches the
         value, a horizontal drag still slides. Same trick as the 'pan-x' on
         hk-row-card, mirrored -- that row handles horizontal so it gives
         vertical away; a slider handles horizontal so it gives vertical away.

         WORSE THAN THE SCENE PILLS THIS MIRRORS: a pill only LOOKS activated,
         a slider writes a value to the home.

         NO BACKTICKS IN THIS COMMENT. All of this CSS lives inside a JS
         TEMPLATE LITERAL, so a backtick closes the string -- the words above
         in backticks throw "SyntaxError: Unexpected identifier 'manipulation'"
         and take every card in this file out: hk-slider, hk-control,
         hk-thermostat and hk-media-control all stop being defined, and a row
         of sliders renders NOTHING. A new Function(src) check catches it. */
      input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:var(--hk-range-h,28px);margin:0;padding:0;background:transparent;border:0;outline:none;touch-action:pan-y;pointer-events:none}
      input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:5px;border:0;background:${window.hkCards.v("line-strong")}}
      input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-9px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.25)}
      input[type=range]::-moz-range-track{height:8px;border-radius:5px;border:0;background:${window.hkCards.v("line-strong")}}
      input[type=range]::-moz-range-thumb{width:26px;height:26px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.25)}
      /* The filled part. The native slider drew this for free; with appearance
         off it has to be explicit. --hk-fill is set per render from the value. */
      input[type=range].filled::-webkit-slider-runnable-track{
        background:linear-gradient(to right,${window.hkCards.v("accent")} 0 var(--hk-fill,0%),${window.hkCards.v("line-strong")} var(--hk-fill,0%) 100%)}
      input[type=range].filled::-moz-range-track{
        background:linear-gradient(to right,${window.hkCards.v("accent")} 0 var(--hk-fill,0%),${window.hkCards.v("line-strong")} var(--hk-fill,0%) 100%)}
      .option-row{margin-top:14px}
      .toggle{height:46px;min-width:116px;border-radius:23px;padding:0 18px;background:${window.hkCards.v("key")};font-size:14px;font-weight:720}
      .toggle.on{background:rgba(48,209,88,.96);color:#fff}
      .water-modes{--count:3}
      /* bare: no plate, no padding. For the Play Music page, where this control
         sits INSIDE the now-playing card and the glass it would otherwise draw
         is already there, one layer down. */
      .media-bare{width:100%}
      .media-bare .prog-track{margin:0 0 6px}
      .media-bare .range-wrap{margin-top:8px}
      /* A lone part owns no inter-part spacing -- see _media's parts option.
         NO BACKTICKS IN HERE: this CSS is a template literal. */
      .media-bare.only-vol .range-wrap{margin-top:0}
      .media-bare.only-prog .prog-track{margin-top:0}
      /* phone_times: false -- no times on a phone, the bar's progress a
         plain line under the song (as a phone's mini player) */
      @media (max-width:${window.hkCards.BP.phone}px){
        .media-bare.no-phone-times .prog-times{display:none}
        .media-bare.no-phone-times .prog-track{margin:0;height:4px}
      }
      /* BIG NUMBER (2026-10-30, docs/phase11/HOMEVIEW-LOOK.md Phase C), measured
         off HomeView in a Large block: the number 31 % of the block tall and
         centred 42.7 % down; the foot centred 86 % down, 7 % in from each side,
         the arrows (58 px, about 32 px of ink) level with the name and room.
         Tall: the number by the width, at 40 %, 38 px arrows, 17 / 16 text,
         the foot at 88 %. Heat and cool: both targets, at about 0.62 of it.
         The name and room are the Centred tiles' (hk-base.js TILE.centred). */
      :host([size]) .surface.big{height:100%}
      .surface.big{position:relative;container-type:size;box-sizing:border-box;padding:0}
      .big .bn{position:absolute;left:0;right:0;top:42.7%;transform:translateY(-50%);text-align:center;color:${window.hkCards.v("ink")};
        font-weight:500;letter-spacing:-.03em;font-variant-numeric:tabular-nums;font-size:min(44cqh,44cqw);line-height:1;
        user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
      :host([size=T]) .big .bn{font-size:min(25cqh,50cqw);top:40%}
      .big.range .bn{font-size:min(28cqh,24cqw)}
      :host([size=T]) .big.range .bn{font-size:min(14cqh,27cqw)}
      .big.idle .bn{font-size:min(24cqh,30cqw)}
      .big .pk{all:unset;cursor:pointer;border-bottom:4px solid transparent;padding:0 .04em}
      .big .pk.sel{border-bottom-color:${window.hkCards.v("ink")}}
      .big .pk:focus-visible,.big .ar:focus-visible,.big .nm:focus-visible{outline:2px solid ${window.hkCards.v("ink-2")};outline-offset:2px}
      .big .ft{position:absolute;left:7%;right:7%;top:86%;transform:translateY(-50%);display:grid;grid-template-columns:58px minmax(0,1fr) 58px;align-items:center}
      .big .ar{all:unset;box-sizing:border-box;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;color:${window.hkCards.v("ink")};
        cursor:pointer;-webkit-tap-highlight-color:transparent}
      .big .ar:active{background:${window.hkCards.v("key")}}
      .big .ar[disabled]{opacity:.35;cursor:default}
      /* (each target a little past its ink: a finger's 44 px, the Tall arrows and a target's digits) */
      .big .ar,.big .pk,.big .nm{position:relative}
      .big .ar::after{content:"";position:absolute;left:-4px;right:-4px;top:-4px;bottom:-4px}
      .big .pk::after{content:"";position:absolute;left:-6px;right:-6px;top:-10px;bottom:-10px}
      .big .nm::after{content:"";position:absolute;left:-4px;right:-4px;top:-6px;bottom:-6px}
      .big .ar svg{width:58px;height:58px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .big .nm{all:unset;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .big .nm b,.big .nm i{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .big .nm b{font-size:${window.hkCards.TILE.centred.square.name}px;font-weight:600;line-height:${window.hkCards.TILE.centred.square.line}px;letter-spacing:-.3px;color:${window.hkCards.v("ink")}}
      .big .nm i{font-style:normal;font-size:${window.hkCards.TILE.centred.square.sub}px;font-weight:400;line-height:${window.hkCards.TILE.centred.square.line}px;color:${window.hkCards.v("ink-2")}}
      :host([size=T]) .big .ft{grid-template-columns:38px minmax(0,1fr) 38px;left:2px;right:2px;top:88%}
      :host([size=T]) .big .ar{width:38px;height:48px;border-radius:24px}
      :host([size=T]) .big .ar svg{width:38px;height:38px;stroke-width:2.2}
      :host([size=T]) .big .nm b{font-size:${window.hkCards.TILE.centred.tall.name}px;line-height:${window.hkCards.TILE.centred.tall.line}px}
      :host([size=T]) .big .nm i{font-size:${window.hkCards.TILE.centred.tall.sub}px;line-height:${window.hkCards.TILE.centred.tall.line}px}
      /* ...a press and hold on the number: its modes, over the block */
      .big .modes{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;gap:8px;padding:16px;
        background:${window.hkCards.OVER.solid};border-radius:inherit}
      .big.choosing .modes{display:flex}
      .big .modes .segment{flex:none;height:44px;border:0;border-radius:22px;color:${window.hkCards.v("ink")};font-size:15px;font-weight:600}
      .big .modes .segment.active{background:#fff;color:#1c1c1e;box-shadow:none}
    `}_pt(f,r){var t=(135+f*270)*Math.PI/180;return[100+r*Math.cos(t),100+r*Math.sin(t)]}_arc(f0,f1,r){var a=this._pt(f0,r),b=this._pt(f1,r);var large=(f1-f0)*270>180?1:0;return`M${a[0].toFixed(2)} ${a[1].toFixed(2)} A${r} ${r} 0 ${large} 1 ${b[0].toFixed(2)} ${b[1].toFixed(2)}`}_heater(){return String(this._entityId()||"").indexOf("water_heater.")===0}_climate(s){if(this._heater())return this._waterDial(s);if(this._config.style==="big"&&this.hasAttribute("size"))return this._big(s);const a=s?.attributes||{},mode=s?.state||"off";const action=a.hvac_action||mode;const cur=Number(a.current_temperature),hum=Number(a.current_humidity);const min=Number(a.min_temp)||45,max=Number(a.max_temp)||95;let lo=Number(a.target_temp_low),hi=Number(a.target_temp_high);let single=Number(a.temperature);const hold=this._hold;if(hold&&Date.now()<hold.until){const took=hold.which==="single"?single===hold.single:lo===hold.lo&&hi===hold.hi;if(took)this._hold=null;else if(hold.which==="single")single=hold.single;else{lo=hold.lo;hi=hold.hi}}else this._hold=null;const range=mode==="heat_cool"&&Number.isFinite(lo)&&Number.isFinite(hi);const frac=t=>Math.max(0,Math.min(1,(t-min)/(max-min)));const f0=range?frac(lo):0;const f1=range?frac(hi):Number.isFinite(single)?frac(single):0;const off=mode==="off";const c0=off?""+window.hkCards.v("mark"):"#32ade6";const c1=off?""+window.hkCards.v("mark"):"#ff9f0a";const g0=this._pt(f0,78),g1=this._pt(f1,78);const val=off?"Off":range?this.hasAttribute("size")?`${Math.round(lo)}–${Math.round(hi)}°`:`${Math.round(lo)} – ${Math.round(hi)}`:Number.isFinite(single)?Math.round(single)+"°":"—";const tall=this.getAttribute("size")==="T";const cap=off?"Thermostat":range?tall?"Range":"Keep between":"Set to";const actC=action==="cooling"?"#32ade6":action==="heating"?"#ff9f0a":""+window.hkCards.v("ink-2");const sub=tall?Number.isFinite(cur)?"Currently "+Math.round(cur)+"°":"":[Number.isFinite(cur)?"Current "+Math.round(cur)+"°":null,Number.isFinite(hum)?"Humidity "+Math.round(hum)+"%":null].filter(Boolean).join(" · ");const actText=tall&&!off&&action!==mode?this._pretty(mode)+" · "+this._pretty(action):this._pretty(action);const knob=(f,which)=>{const p=this._pt(f,78);return`<circle class="kn" data-knob="${which}" cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="13"/>`};const dot=Number.isFinite(cur)?(p=>`<circle class="cur" cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="4"/>`)(this._pt(frac(cur),78)):"";const fanModes=a.fan_modes||[];const ORDER=["off","heat","cool","heat_cool"];const has=Array.isArray(a.hvac_modes)&&a.hvac_modes.length?a.hvac_modes:ORDER;const modes=ORDER.filter(m=>has.includes(m)).concat(has.filter(m=>!ORDER.includes(m)));return`<div class="surface tstat">
      ${tall?`<button class="tstat-name" type="button" data-tstat-details aria-label="${this._esc(this._name())}, mode ${this._esc(this._pretty(mode))}, open the thermostat"><span>${this._esc(this._name())}</span><i aria-hidden="true">›</i></button>`:`<div class="tstat-name">${this._esc(this._name())}</div>`}
      <div class="tstat-sub">${this._esc(sub)}</div>
      <div class="tstat-wrap">
        <!-- viewBox cropped to 172, not 200. The ring's legs end at y=155
             (100 + 78*sin135) and the stroke is 22 wide, so everything below
             ~166 is empty by construction -- on a 300px ring that was 60px of
             dead card between the dial and the mode row. RING_VB in _bind has
             to match: the ring's centre is no longer the element's centre. -->
        <svg class="ring" viewBox="0 0 200 172" data-ring>
          <defs><linearGradient id="bandg" gradientUnits="userSpaceOnUse"
            x1="${g0[0].toFixed(2)}" y1="${g0[1].toFixed(2)}" x2="${g1[0].toFixed(2)}" y2="${g1[1].toFixed(2)}">
            <stop offset="0" style="stop-color:${c0}"/><stop offset="1" style="stop-color:${c1}"/>
          </linearGradient></defs>
          <path class="trk" d="${this._arc(0,1,78)}"/>
          ${f1>f0?`<path class="bnd" stroke="url(#bandg)" d="${this._arc(f0,f1,78)}"/>`:""}
          ${dot}
          ${range?knob(f0,"low")+knob(f1,"high"):off?"":knob(f1,"single")}
          <path class="hit" d="${this._arc(0,1,78)}"/>
        </svg>
        <div class="tstat-face">
          <div class="tstat-cap">${cap}</div>
          <div class="tstat-val" data-face>${val}</div>
          <div class="tstat-act" style="color:${actC}">${this._esc(actText)}</div>
        </div>
      </div>
      <div class="tstat-modes segments" style="--count:${modes.length}">${this.getAttribute("size")==="T"?`<button class="segment" data-tstat-details aria-label="Change mode, currently ${this._esc(this._pretty(mode))}">Mode · ${this._esc(this._pretty(mode))} ›</button>`:modes.map(m=>`<button class="segment ${mode===m?"active":""}" data-mode="${this._esc(m)}">${this._esc(this._pretty(m))}</button>`).join("")}</div>
      ${fanModes.length?`<div class="tstat-fan" style="--count:${fanModes.length}">${fanModes.map(m=>`<button class="segment ${a.fan_mode===m?"active":""}" data-fan="${this._esc(m)}">${this._esc(this._pretty(m))}</button>`).join("")}</div>`:""}
    </div>`}_bigStep(a){const n=Number(a&&a.target_temp_step);if(n>0)return n;return/C/.test(window.hkLocale?.units?.().temp||"")?.5:1}_bigText(t,a){return this._bigStep(a)<1&&Math.round(t)!==t?t.toFixed(1):String(Math.round(t))}_room(){const c=this.client,e=c?.entities?.[this._entityId()]||{},d=(c?.devices||{})[e.device_id]||{};const area=e.area_id||d.area_id;return area&&c?.areas?.[area]?.name||""}_big(s){const a=s?.attributes||{},mode=s?.state||"off";let lo=Number(a.target_temp_low),hi=Number(a.target_temp_high),single=Number(a.temperature);const hold=this._hold;if(hold&&Date.now()<hold.until){const took=hold.which==="single"?single===hold.single:lo===hold.lo&&hi===hold.hi;if(took&&!this._bigT)this._hold=null;else if(hold.which==="single")single=hold.single;else{lo=hold.lo;hi=hold.hi}}else this._hold=null;const range=mode==="heat_cool"&&Number.isFinite(lo)&&Number.isFinite(hi);const idle=mode==="off"||!range&&!Number.isFinite(single);const pick=this._bigPick==="high"?"high":"low",t=v=>this._esc(this._bigText(v,a));const pk=(which,v,verb)=>`<button class="pk${pick===which?" sel":""}" type="button" data-big-pick="${which}" aria-pressed="${pick===which}" aria-label="${verb} ${t(v)} degrees">${t(v)}</button>`;const bn=mode==="off"?"Off":idle?"—":range?pk("low",lo,"Heat to")+"–"+pk("high",hi,"Cool to"):t(single);const ORDER=["off","heat","cool","heat_cool"];const has=Array.isArray(a.hvac_modes)&&a.hvac_modes.length?a.hvac_modes:ORDER;const modes=ORDER.filter(m=>has.includes(m)).concat(has.filter(m=>!ORDER.includes(m)));const name=this._esc(this._name()),room=this._esc(this._room());const arrow=(dir,d,label)=>`<button class="ar" type="button" data-big-step="${dir}" aria-label="${label}"${idle?" disabled":""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg></button>`;return`<div class="surface big${range?" range":""}${idle?" idle":""}${this._bigModes?" choosing":""}" data-big>
      <div class="bn" data-big-num aria-label="${range?"":(mode==="off"?"Off":t(single)+" degrees")+", press and hold for the modes"}">${bn}</div>
      <div class="ft">
        ${arrow(-1,"M5.5 9.5 12 16l6.5-6.5",range?pick==="low"?"Lower the heating target":"Lower the cooling target":"Lower the target")}
        <button class="nm" type="button" data-tstat-details aria-label="${name}${room?", "+room:""}, open the thermostat"><b>${name}</b>${room?`<i>${room}</i>`:""}</button>
        ${arrow(1,"M5.5 14.5 12 8l6.5 6.5",range?pick==="low"?"Raise the heating target":"Raise the cooling target":"Raise the target")}
      </div>
      <div class="modes" role="group" aria-label="Mode">${modes.map(m=>`<button class="segment${mode===m?" active":""}" type="button" data-mode="${this._esc(m)}">${this._esc(this._pretty(m))}</button>`).join("")}</div>
    </div>`}_bigNudge(dir,call){const st=this._state(),a=st?.attributes||{},mode=st?.state||"off",step=this._bigStep(a);const min=Number(a.min_temp),max=Number(a.max_temp);const clamp=v=>Math.round(Math.max(Number.isFinite(min)?min:-Infinity,Math.min(Number.isFinite(max)?max:Infinity,v))*100)/100;const snap=v=>clamp(Math.round(v/step)*step),held=this._hold&&Date.now()<this._hold.until?this._hold:null;if(mode==="off")return;if(mode==="heat_cool"&&Number.isFinite(Number(a.target_temp_low))&&Number.isFinite(Number(a.target_temp_high))){let lo=held&&held.which!=="single"?held.lo:Number(a.target_temp_low);let hi=held&&held.which!=="single"?held.hi:Number(a.target_temp_high);if(this._bigPick==="high")hi=Math.max(snap(hi+dir*step),lo+step);else lo=Math.min(snap(lo+dir*step),hi-step);this._hold={which:this._bigPick==="high"?"high":"low",lo,hi,until:Date.now()+8e3}}else{const now=held&&held.which==="single"?held.single:Number(a.temperature);if(!Number.isFinite(now))return;this._hold={which:"single",single:snap(now+dir*step),until:Date.now()+8e3}}this._render();clearTimeout(this._bigT);this._bigT=setTimeout(()=>{this._bigT=null;const h=this._hold;if(!h)return;h.until=Date.now()+8e3;call("climate","set_temperature",h.which==="single"?{temperature:h.single}:{target_temp_low:h.lo,target_temp_high:h.hi})},600)}_bindBig(el,call){el.querySelectorAll("[data-big-pick]").forEach(b=>b.onclick=e=>{e.stopPropagation();if(this._bigHeld){this._bigHeld=false;return}this._bigPick=b.dataset.bigPick;this._render()});el.querySelectorAll("[data-big-step]").forEach(b=>b.onclick=e=>{e.stopPropagation();this._bigNudge(Number(b.dataset.bigStep),call)});const num=el.querySelector("[data-big-num]");if(num){let timer=null,x=0,y=0;const stop=()=>{clearTimeout(timer);timer=null};num.onpointerdown=e=>{x=e.clientX;y=e.clientY;this._bigHeld=false;stop();timer=setTimeout(()=>{timer=null;this._bigHeld=true;this._bigModes=true;this._render()},500)};num.onpointermove=e=>{if(timer&&(Math.abs(e.clientX-x)>8||Math.abs(e.clientY-y)>8))stop()};num.onpointerup=num.onpointercancel=num.onpointerleave=stop;num.oncontextmenu=e=>e.preventDefault()}const box=el.querySelector(".modes");if(box)box.onclick=e=>{if(e.target===box){e.stopPropagation();this._bigModes=false;this._render()}};el.querySelectorAll(".modes [data-mode]").forEach(b=>b.onclick=e=>{e.stopPropagation();this._bigModes=false;call("climate","set_hvac_mode",{hvac_mode:b.dataset.mode});this._render()});el.onkeydown=e=>{if(e.key==="Escape"&&this._bigModes){this._bigModes=false;this._render()}}}_waterDial(s){const a=s?.attributes||{},mode=s?.state||"off",off=mode==="off";const f=Number(a.supported_features)||0;const cur=Number(a.current_temperature);const min=Number(a.min_temp)||90,max=Number(a.max_temp)||150;let single=Number(a.temperature);const hold=this._hold;if(hold&&Date.now()<hold.until){if(single===hold.single)this._hold=null;else single=hold.single}else this._hold=null;const frac=t=>Math.max(0,Math.min(1,(t-min)/(max-min)));const f1=Number.isFinite(single)?frac(single):0;const c0=off?window.hkCards.v("mark"):"#32ade6",c1=off?window.hkCards.v("mark"):"#ff9f0a";const g0=this._pt(0,78),g1=this._pt(f1,78);const word=m=>({high_demand:"Demand",heat_pump:"Heat Pump"})[m]||this._pretty(m);const away=a.away_mode==="on";const om=a.operation_mode||mode;const val=off?"Off":Number.isFinite(single)?Math.round(single)+"°":"—";const sub=[Number.isFinite(cur)?"Current "+Math.round(cur)+"°":null,away?"Away":null].filter(Boolean).join(" · ");const dot=Number.isFinite(cur)?(p=>`<circle class="cur" cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="4"/>`)(this._pt(frac(cur),78)):"";const kp=this._pt(f1,78);const knob=off||!(f&1)||!Number.isFinite(single)?"":`<circle class="kn" data-knob="single" cx="${kp[0].toFixed(2)}" cy="${kp[1].toFixed(2)}" r="13"/>`;const list=(a.operation_list||[]).filter(m=>m!=="off");const power=!!(f&8)||(a.operation_list||[]).includes("off");const modes=f&2?(power?["off"]:[]).concat(list):power?["off","on"]:[];const isOn=m=>m==="off"?off:m==="on"?!off:!off&&om===m;return`<div class="surface tstat">
      <div class="tstat-name">${this._esc(this._name())}</div>
      <div class="tstat-sub">${this._esc(sub)}</div>
      <div class="tstat-wrap">
        <svg class="ring" viewBox="0 0 200 172" data-ring>
          <defs><linearGradient id="bandg" gradientUnits="userSpaceOnUse"
            x1="${g0[0].toFixed(2)}" y1="${g0[1].toFixed(2)}" x2="${g1[0].toFixed(2)}" y2="${g1[1].toFixed(2)}">
            <stop offset="0" style="stop-color:${c0}"/><stop offset="1" style="stop-color:${c1}"/>
          </linearGradient></defs>
          <path class="trk" d="${this._arc(0,1,78)}"/>
          ${f1>0?`<path class="bnd" stroke="url(#bandg)" d="${this._arc(0,f1,78)}"/>`:""}
          ${dot}${knob}
          <path class="hit" d="${this._arc(0,1,78)}"/>
        </svg>
        <div class="tstat-face">
          <div class="tstat-cap">${off?"Water Heater":"Heat to"}</div>
          <div class="tstat-val" data-face>${val}</div>
          <div class="tstat-act" style="color:${off?window.hkCards.v("ink-2"):"#ff9f0a"}">${this._esc(off?"Off":word(om))}</div>
        </div>
      </div>
      ${modes.length?`<div class="tstat-modes segments" style="--count:${modes.length}">${modes.map(m=>`<button class="segment ${isOn(m)?"active":""}" data-wh="${this._esc(m)}">${this._esc(word(m))}</button>`).join("")}</div>`:""}
      ${f&4?`<div class="tstat-fan" style="--count:2"><button class="segment ${away?"":"active"}" data-wh-away="off">Home</button><button class="segment ${away?"active":""}" data-wh-away="on">Away</button></div>`:""}
    </div>`}_number(s){const a=s?.attributes||{},val=Number(s?.state),min=Number(a.min),max=Number(a.max),step=Number(a.step)||1,unit=a.unit_of_measurement||"";const pct=max>min&&Number.isFinite(val)?((val-min)/(max-min)*100).toFixed(2):0;if(this._config.layout==="tile")this.setAttribute("data-tilel","");else this.removeAttribute("data-tilel");return`<div class="surface compact${this._config.layout==="tile"?" tilel":""}">
      <div class="head"><div class="glyph"><hk-icon icon="${this._icon("number")}"></hk-icon></div><div class="titles"><div class="name">${this._esc(this._name())}</div><div class="sub">${this._esc(this._rangeText(min,max,unit))}</div></div><div class="value" data-live>${Number.isFinite(val)?this._valueText(val,unit):"—"}</div></div>
      <div class="range-wrap" data-hk-control><input class="filled" data-number type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--hk-fill:${pct}%"></div>
    </div>`}_select(s){const options=s?.attributes?.options||[];return`<div class="surface compact"><div class="head"><div class="glyph"><hk-icon icon="${this._icon("select")}"></hk-icon></div><div class="titles"><div class="name">${this._esc(this._name())}</div><div class="sub">Choose an operating mode</div></div><div class="value">${this._esc(this._pretty(s?.state))}</div></div><div class="option-row${options.length>5?" many":""}" style="--count:${Math.max(1,options.length)}">${options.map(o=>`<button class="segment ${s?.state===o?"active":""}" data-option="${this._esc(o)}">${this._esc(this._pretty(o))}</button>`).join("")}</div></div>`}_switch(s){const on=s?.state==="on";return`<div class="surface compact"><div class="head"><div class="glyph"><hk-icon icon="${this._icon("switch")}"></hk-icon></div><div class="titles"><div class="name">${this._esc(this._name())}</div><div class="sub">${on?"Enabled":"Disabled"}</div></div><button class="toggle ${on?"on":""}" data-toggle>${on?"On":"Off"}</button></div></div>`}_valve(s){const state=s?.state||"unknown";return`<div class="surface compact"><div class="head"><div class="glyph"><hk-icon icon="${this._icon("valve")}"></hk-icon></div><div class="titles"><div class="name">${this._esc(this._name())}</div><div class="sub">${this._esc(this._config.subtitle||{water:"Water valve",gas:"Gas valve"}[s?.attributes?.device_class]||"Valve")}</div></div><div class="value">${this._esc(this._pretty(state))}</div></div><div class="option-row" style="--count:2"><button class="segment ${state==="open"?"active":""}" data-valve="open">Open</button><button class="segment ${state==="closed"?"active":""}" data-valve="close">Close</button></div></div>`}_waterHeater(s){const options=s?.attributes?.operation_list||[];return`<div class="surface compact"><div class="head"><div class="glyph"><hk-icon icon="${this._icon("water_heater")}"></hk-icon></div><div class="titles"><div class="name">${this._esc(this._name())}</div><div class="sub">${Number.isFinite(Number(s?.attributes?.current_temperature))?Math.round(Number(s.attributes.current_temperature))+"° current · "+Math.round(Number(s.attributes.temperature))+"° target":"Operating mode"}</div></div><div class="value">${this._esc(this._pretty(s?.state))}</div></div><div class="option-row water-modes">${options.map(o=>`<button class="segment ${s?.state===o?"active":""}" data-water-mode="${this._esc(o)}">${this._esc(this._pretty(o))}</button>`).join("")}</div></div>`}_media(s){const a=s?.attributes||{};const playing=s?.state==="playing";const vol=Math.round(Number(a.volume_level??0)*100);const dur=Number(a.media_duration)||0;let pos=Number(a.media_position)||0;if(playing&&a.media_position_updated_at){const drift=(Date.now()-Date.parse(a.media_position_updated_at))/1e3;if(Number.isFinite(drift)&&drift>0)pos+=drift}if(dur>0)pos=Math.max(0,Math.min(dur,pos));const clock=t=>{const n=Math.max(0,Math.round(t));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return(h?h+":":"")+(h&&m<10?"0":"")+m+":"+String(sec).padStart(2,"0")};const pct=dur>0?(pos/dur*100).toFixed(2):0;const at=`transform:translateX(${(pct-100).toFixed(2)}%)`;const fill=`style="${at}"`;this._prog=dur>0&&playing?{dur,pos,at:Date.now()}:null;const elapsed=dur>0?playing?`<hk-countdown since="${Date.now()-Math.round(pos*1e3)}" total="${Math.round(dur)}">${clock(pos)}</hk-countdown>`:`<hk-countdown hold="${Math.round(pos)}" total="${Math.round(dur)}">${clock(pos)}</hk-countdown>`:"--:--";const times=dur>0?`<span>${elapsed}</span><span>${clock(dur)}</span>`:`<span>--:--</span><span>--:--</span>`;const parts=Array.isArray(this._config.parts)&&this._config.parts.length?this._config.parts:["progress","volume"];const hasProg=parts.indexOf("progress")>=0;const hasVol=parts.indexOf("volume")>=0;const cls=(this._config.bare?"media-bare":"surface compact")+(hasProg&&!hasVol?" only-prog":"")+(hasVol&&!hasProg?" only-vol":"")+(this._config.phone_times===false?" no-phone-times":"")+(s?"":" off");return`<div class="${cls}">
      ${hasProg?`<div class="prog-track"><div class="prog-fill" ${fill}></div></div>
      <div class="prog-times">${times}</div>`:""}
      ${hasVol?`<div class="range-wrap" data-hk-control><input class="filled" data-vol type="range" min="0" max="100" step="1" value="${vol}" style="--hk-fill:${vol}%"></div>`:""}
    </div>`}_bind(){const root=this.shadowRoot,id=this._entityId(),call=(d,s,data={})=>Promise.resolve(this._svc(d,s,{entity_id:id,...data})).catch(err=>{console.error("hk-control-card: "+d+"."+s+" failed",data,err)});const ring=root.querySelector("[data-ring]");if(ring){const st=this._state(),aa=st?.attributes||{};const min=Number(aa.min_temp)||45,max=Number(aa.max_temp)||95;const step=Number(aa.target_temp_step)||1;const mode=st?.state||"off";const range2=mode==="heat_cool"&&Number.isFinite(Number(aa.target_temp_low))&&Number.isFinite(Number(aa.target_temp_high));const face=root.querySelector("[data-face]");let grabbed=null,preview=null;const RING_VB={w:200,h:172,cx:100,cy:100};const tempAt=e=>{const r=ring.getBoundingClientRect();const dx=e.clientX-(r.left+r.width*(RING_VB.cx/RING_VB.w));const dy=e.clientY-(r.top+r.height*(RING_VB.cy/RING_VB.h));let deg=Math.atan2(dy,dx)*180/Math.PI;let rel=(deg-135+360)%360;if(rel>270)rel=rel-270<360-rel?270:0;const t=min+rel/270*(max-min);return Math.max(min,Math.min(max,Math.round(t/step)*step))};const frac=t=>Math.max(0,Math.min(1,(t-min)/(max-min)));const geo=(f0,f1,which,t)=>{const kn=ring.querySelector('[data-knob="'+which+'"]');if(kn){const p=this._pt(frac(t),78);kn.setAttribute("cx",p[0].toFixed(2));kn.setAttribute("cy",p[1].toFixed(2))}let bnd=ring.querySelector(".bnd");if(!bnd&&f1>f0){bnd=document.createElementNS("http://www.w3.org/2000/svg","path");bnd.setAttribute("class","bnd");bnd.setAttribute("stroke","url(#bandg)");const trk=ring.querySelector(".trk");if(trk&&trk.nextSibling)ring.insertBefore(bnd,trk.nextSibling);else ring.appendChild(bnd)}if(bnd)bnd.setAttribute("d",f1>f0?this._arc(f0,f1,78):"");const g=ring.querySelector("#bandg"),a0=this._pt(f0,78),a1=this._pt(f1,78);if(g){g.setAttribute("x1",a0[0].toFixed(2));g.setAttribute("y1",a0[1].toFixed(2));g.setAttribute("x2",a1[0].toFixed(2));g.setAttribute("y2",a1[1].toFixed(2))}};const paint2=(which,t)=>{if(!range2){if(face)face.textContent=Math.round(t)+"°";geo(0,frac(t),"single",t);return}let lo=Number(aa.target_temp_low),hi=Number(aa.target_temp_high);if(which==="low")lo=Math.min(t,hi-step);else hi=Math.max(t,lo+step);if(face)face.textContent=Math.round(lo)+" – "+Math.round(hi);geo(frac(lo),frac(hi),which,which==="low"?lo:hi)};var SLOP=6,startX=0,startY=0,pending=null;const done=()=>{this._dragging=false;if(this._deferred){this._deferred=false;this._render()}};const abandon=()=>{pending=null;if(grabbed){const was=grabbed;grabbed=null;preview=null;if(range2)paint2(was,was==="low"?Number(aa.target_temp_low):Number(aa.target_temp_high));else paint2("single",Number(aa.temperature))}if(range2&&face){face.textContent=Math.round(Number(aa.target_temp_low))+" – "+Math.round(Number(aa.target_temp_high))}done()};ring.onpointerdown=e=>{if(mode==="off")return;if(!range2&&(aa.temperature==null||!Number.isFinite(Number(aa.temperature))))return;ring.setPointerCapture(e.pointerId);startX=e.clientX;startY=e.clientY;const t=tempAt(e);var which;if(range2){const lo=Number(aa.target_temp_low),hi=Number(aa.target_temp_high);which=Math.abs(t-lo)<=Math.abs(t-hi)?"low":"high"}else which="single";pending={which,t};this._dragging=true};ring.onpointermove=e=>{if(!ring.hasPointerCapture(e.pointerId))return;if(pending){const dx=e.clientX-startX,dy=e.clientY-startY;if(dx*dx+dy*dy<=SLOP*SLOP)return;grabbed=pending.which;pending=null}if(!grabbed)return;preview=tempAt(e);paint2(grabbed,preview)};ring.onpointercancel=e=>{try{ring.releasePointerCapture(e.pointerId)}catch(_){}abandon()};ring.onpointerup=e=>{if(!grabbed&&!pending){done();return}ring.releasePointerCapture(e.pointerId);if(!grabbed&&pending){grabbed=pending.which;preview=pending.t;pending=null}const t=preview,which=grabbed;grabbed=null;paint2(which,t);if(which==="single"){this._hold={which,single:t,until:Date.now()+8e3};call(this._heater()?"water_heater":"climate","set_temperature",{temperature:t});done();return}let lo=Number(aa.target_temp_low),hi=Number(aa.target_temp_high);if(which==="low")lo=Math.min(t,hi-step);else hi=Math.max(t,lo+step);this._hold={which,lo,hi,until:Date.now()+8e3};call("climate","set_temperature",{target_temp_low:lo,target_temp_high:hi});done()}}root.querySelectorAll("[data-tstat-details]").forEach(b=>b.onclick=()=>window.hkShell.moreInfo(id,this));root.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>call("climate","set_hvac_mode",{hvac_mode:b.dataset.mode}));const big=root.querySelector("[data-big]");if(big)this._bindBig(big,call);root.querySelectorAll("[data-fan]").forEach(b=>b.onclick=()=>call("climate","set_fan_mode",{fan_mode:b.dataset.fan}));root.querySelectorAll("[data-option]").forEach(b=>b.onclick=()=>call("select","select_option",{option:b.dataset.option}));root.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>call("switch","toggle"));root.querySelectorAll("[data-valve]").forEach(b=>b.onclick=()=>call("valve",b.dataset.valve==="open"?"open_valve":"close_valve"));root.querySelectorAll("[data-wh]").forEach(b=>b.onclick=()=>{const m=b.dataset.wh,st=this._state(),ff=Number(st?.attributes?.supported_features)||0;const ops=st?.attributes?.operation_list||[];if(m==="off")return ff&8?call("water_heater","turn_off"):call("water_heater","set_operation_mode",{operation_mode:"off"});if(m==="on")return call("water_heater","turn_on");if(st?.state==="off"&&ff&8&&!ops.includes("off"))call("water_heater","turn_on");call("water_heater","set_operation_mode",{operation_mode:m})});root.querySelectorAll("[data-wh-away]").forEach(b=>b.onclick=()=>call("water_heater","set_away_mode",{away_mode:b.dataset.whAway==="on"}));root.querySelectorAll("[data-water-mode]").forEach(b=>b.onclick=()=>call("water_heater","set_operation_mode",{operation_mode:b.dataset.waterMode}));const paint=el=>{const min=Number(el.min)||0,max=Number(el.max);const p=max>min?(Number(el.value)-min)/(max-min)*100:0;el.style.setProperty("--hk-fill",p.toFixed(2)+"%")};const SLIDER_SLOP=8,THUMB=26;const wireSlider=(el,commit)=>{if(!el)return;const wrap=el.parentElement;const bounds=()=>{const a=this._state()?.attributes||{};const isVol=el.hasAttribute("data-vol");return{min:isVol?0:Number(a.min)||0,max:isVol?100:Number(a.max),step:isVol?1:Number(a.step)||1}};const valueAt=clientX=>{const b=bounds(),r=el.getBoundingClientRect();const usable=Math.max(1,r.width-THUMB);let pct=(clientX-r.left-THUMB/2)/usable;pct=Math.max(0,Math.min(1,pct));let v=b.min+pct*(b.max-b.min);v=Math.round(v/b.step)*b.step;return Math.max(b.min,Math.min(b.max,v))};const show=v=>{el.value=String(v);el.dispatchEvent(new Event("input"))};const held=on=>{this._dragging=on;if(!on&&this._deferred){this._deferred=false;this._render()}};let g=null;wrap.addEventListener("pointerdown",e=>{g={x:e.clientX,y:e.clientY,live:e.pointerType==="mouse",v:null};if(g.live){try{wrap.setPointerCapture(e.pointerId)}catch(_){}held(true);g.v=valueAt(e.clientX);show(g.v)}});wrap.addEventListener("pointermove",e=>{if(!g)return;if(!g.live){const dx=Math.abs(e.clientX-g.x),dy=Math.abs(e.clientY-g.y);if(dx<SLIDER_SLOP&&dy<SLIDER_SLOP)return;if(dx<=dy){g=null;return}g.live=true;held(true);try{wrap.setPointerCapture(e.pointerId)}catch(_){}}g.v=valueAt(e.clientX);show(g.v);e.preventDefault()},{passive:false});wrap.addEventListener("pointerup",e=>{if(!g)return;const v=g.v,live=g.live;g=null;try{wrap.releasePointerCapture(e.pointerId)}catch(_){}if(v!==null)commit(v);if(live)held(false)});wrap.addEventListener("pointercancel",()=>{const was=g;g=null;if(was&&was.live){this._deferred=false;this._dragging=false}if(was&&(was.live||was.v!==null))this._render()})};const vol=root.querySelector("[data-vol]");if(vol){const setVol=pct=>{const next=Math.max(0,Math.min(1,pct/100));let members=this._state()?.attributes?.group_members||[];let sync=false;if(members.length<2){const preset=window.hkMusic&&window.hkMusic.presets().filter(p=>p.entity===id)[0];const m=preset&&preset.members||(this._config.members_map||{})[id];if(m&&m.length>1){members=m;sync=true}}if(members.length<2)return call("media_player","volume_set",{volume_level:next});if(!sync)return call("media_player","volume_set",{entity_id:members,volume_level:next});return Promise.resolve(this._svc("media_player","volume_set",{entity_id:id,volume_level:next})).then(()=>this._svc("media_player","volume_set",{entity_id:members,volume_level:next})).catch(err=>{console.error("hk-control-card: group volume_set failed",err)})};vol.oninput=()=>paint(vol);vol.onchange=()=>setVol(Number(vol.value));wireSlider(vol,v=>setVol(v))}const range=root.querySelector("[data-number]");if(range){const unit=this._state()?.attributes?.unit_of_measurement||"",live=root.querySelector("[data-live]");range.oninput=()=>{paint(range);if(live)live.textContent=this._valueText(Number(range.value),unit)};range.onchange=()=>call("number","set_value",{value:Number(range.value)});wireSlider(range,v=>call("number","set_value",{value:v}))}}}window.hkHostClient.entry(HkControlCard);if(window.hkCards&&window.hkCards.sized)window.hkCards.sized("hk-control-card",HkControlCard);if(!customElements.get("hk-control-card"))customElements.define("hk-control-card",HkControlCard);(function(){function wire(){var C=window.hkCards;if(!C||!C.editor||HkControlCard.getConfigElement)return;var etag=C.editor("hk-control-card",[{name:"entity",selector:{entity:{}}},{type:"grid",name:"",schema:[{name:"name",selector:{text:{}}},{name:"control",selector:C.selOptions(["climate","number",["select","Option buttons"],["switch","Switch"],["valve","Valve"],["water_heater","Water heater"],"media_player"])}]},C.section("Appearance",[{type:"grid",name:"",schema:[{name:"icon",selector:{icon:{}}},{name:"color",selector:C.selColour()},{name:"bare",selector:{boolean:{}}}]}],"mdi:palette"),C.section("Advanced",[{name:"entity_from",selector:{object:{}}}],"mdi:cog")]);HkControlCard.getConfigElement=function(){return document.createElement(etag)};HkControlCard.getStubConfig=function(input){var client=window.hkCards.asClient(input),ids=client?Object.keys(client.states):[];for(var i=0;i<ids.length;i++){if(ids[i].indexOf("climate.")===0)return{entity:ids[i]}}return{entity:"climate.example"}}}wire();window.addEventListener("hk-cards-ready",wire)})();window.customCards=window.customCards||[];if(!window.customCards.some(c=>c.type==="hk-control-card"))window.customCards.push({type:"hk-control-card",name:"HK Control (automatic)",description:"Draws a dial, slider or media controls depending on the entity. Prefer HK Thermostat, Slider or Media Controls.",preview:true});(function(){function variant(tag,control,name,description,extra,stubDomain){if(customElements.get(tag))return;class V extends HkControlCard{setConfig(config){super.setConfig(Object.assign({},config,{control}));if(this.style){this.style.width=config&&config.dial_width||"";this.style.maxWidth=config&&config.dial_width?"100%":""}}}if(window.hkCards&&window.hkCards.sized)window.hkCards.sized(tag,V);customElements.define(tag,V);function wire(){var C=window.hkCards;if(!C||!C.editor||Object.prototype.hasOwnProperty.call(V,"getConfigElement"))return;var etag=C.editor(tag,[{name:"entity",selector:{entity:{filter:{domain:control}}}},{name:"name",selector:{text:{}}},C.section("Appearance",[{type:"grid",name:"",schema:[{name:"icon",selector:{icon:{}}},{name:"color",selector:C.selColour()}].concat(extra||[])}],"mdi:palette"),C.section("Advanced",[{name:"entity_from",selector:{object:{}}}],"mdi:cog")]);V.getConfigElement=function(){return document.createElement(etag)};V.getStubConfig=function(input){var client=window.hkCards.asClient(input),ids=client?Object.keys(client.states):[];for(var i=0;i<ids.length;i++){if(ids[i].indexOf(stubDomain+".")===0)return{entity:ids[i]}}return{entity:stubDomain+".example"}}}wire();window.addEventListener("hk-cards-ready",wire);if(!window.customCards.some(function(c){return c.type===tag})){window.customCards.push({type:tag,name,description,preview:true})}}var BARE={name:"bare",selector:{boolean:{}}};variant("hk-thermostat-card","climate","HK Thermostat","A thermostat dial with the current temperature, target and mode buttons.",[BARE],"climate");variant("hk-slider-card","number","HK Slider","A slider for a number entity, such as a battery charge limit or reserve.",[BARE,{name:"layout",selector:{select:{mode:"dropdown",options:[{value:"compact",label:"Compact"},{value:"tile",label:"Tile (as tall as the Energy page's cards)"}]}}}],"number");variant("hk-media-control-card","media_player","HK Media Controls","Progress bar and volume slider for a media player.",[{name:"bare",selector:{boolean:{}}},{name:"members_map",label:"Sync group members",helper:"Group entity -> its speakers. A sync group's membership is not readable from HA; without it the volume slider cannot level one.",selector:{object:{}}},{name:"parts",selector:{select:{multiple:true,mode:"list",options:[{value:"progress",label:"Progress bar"},{value:"volume",label:"Volume slider"}]}}}],"media_player")})();
