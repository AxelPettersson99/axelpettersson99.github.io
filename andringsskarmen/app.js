/* Ändringsskärmen – reads window.RESULTS (written by scripts/06_site.py from output/results.json)
   and draws four views: ranking (#ranking), company (#bolag-<id>), method (#metod), about (#om).
   No framework: plain functions that build HTML strings. Nothing here changes a number;
   it only formats what results.json contains. */
(function () {
  "use strict";
  const R = window.RESULTS;
  const app = document.getElementById("app");
  if (!R) { app.innerHTML = "<p>Hittade ingen data. Kör scripts/06_site.py först.</p>"; return; }
  const Y0 = R.meta.year_old, Y1 = R.meta.year_new;

  // ── words used on the site ─────────────────────────────────────
  const SECTOR = {
    "Industrials": "Industri", "Consumer Discretionary": "Sällanköpsvaror", "Basic Materials": "Råvaror",
    "Real Estate": "Fastigheter", "Health Care": "Hälsovård", "Technology": "Teknik", "Financials": "Finans",
    "Telecommunications": "Telekom", "Consumer Staples": "Dagligvaror", "Energy": "Energi", "Utilities": "Kraftförsörjning",
  };
  const THEME = {
    "Tariffs and trade": "Tullar och handel", "Geopolitics and war": "Geopolitik och krig", "Cyber and IT": "Cyber och IT",
    "AI and new technology": "AI och ny teknik", "Climate and environment": "Klimat och miljö",
    "Energy and raw materials": "Energi och råvaror", "Supply chain": "Leverantörskedja",
    "Interest rates and financing": "Räntor och finansiering", "Currency": "Valuta",
    "Demand and the economy": "Efterfrågan och konjunktur", "Regulation and legal": "Regler och juridik",
    "People and skills": "Personal och kompetens", "Acquisitions": "Förvärv", "Health and pandemics": "Hälsa och pandemier",
    "Reputation and ethics": "Anseende och etik", "Property values and tenants": "Fastighetsvärden och hyresgäster",
  };
  const FLAG = {
    length_ratio: "avsnittet är mycket längre eller kortare det ena året",
    full_rewrite: "nästan allt är nytt, vilket oftare beror på ny layout än på nya risker",
    method_differs: "avsnittet hittades på olika sätt de två åren",
    heading_differs: "olika rubriker de två åren",
    check_section: "avsnittet behöver kontrolleras för hand",
    hardly_mentions_risk: "texten nämner nästan inte risk",
    noisy_layout: "radbrytningarna ger för mycket brus",
    end_not_found: "slutet på avsnittet hittades inte",
    language_differs: "olika språk de två åren",
    taken_from_notes: "texten kom från noterna",
    start_uncertain: "början på avsnittet är osäker",
    no_sentences: "inga meningar att jämföra",
    extraction_glued_words: "texten gick inte att läsa ut rent",
    extraction_letter_spaced: "texten gick inte att läsa ut rent",
    located_by_model: "avsnittet hittades av en modell och kanterna är inte kontrollerade",
  };
  const NOTE = {
    located_by_model: "Hittat av modell",
    short_section: "Kort avsnitt",
    few_sentences: "Få meningar",
    manual_override: "Kanter kontrollerade",
    approved_by_hand: "Kontrollerad för hand",
  };
  // what the change in the risk section mostly consists of, set when both sections were read
  const DRIVER = {
    innehall: ["Nytt innehåll", "Nya eller strukna risker, nya bedömningar eller nya händelser står för det mesta av ändringen."],
    struktur: ["Ny struktur", "Avsnittet är omorganiserat: ny uppställning, sammanslagna eller flyttade delar. Riskerna i sak är till största delen desamma."],
    omformulering: ["Omformulering", "Samma risker i samma upplägg, beskrivna med nya ord."],
    liten: ["Liten ändring", "Några meningar är uppdaterade. Resten står ordagrant som året innan."],
  };
  const DRIVER_ORDER = ["innehall", "struktur", "omformulering", "liten"];
  const FTYPE = { ny: "Nytt", borttagen: "Borttaget", skarpt: "Skärpt", nedtonat: "Nedtonat", struktur: "Struktur", uppdaterat: "Uppdaterat" };
  const driverChip = (a) => a && DRIVER[a.driver] ? `<span class="driver d-${a.driver}" title="${esc(DRIVER[a.driver][1])}">${DRIVER[a.driver][0]}</span>` : "–";

  // ── formatting (Swedish: decimal comma, space as thousands separator) ──
  const nf = (d) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => (x == null ? "–" : nf(d).format(x * 100) + " %");
  const num = (x, d = 0) => (x == null ? "–" : nf(d).format(x));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const idOf = (name) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sectorSv = (s) => (s ? SECTOR[s] || s : "–");
  const themeSv = (t) => THEME[t] || t;

  function reasonSv(reason) {
    if (!reason) return "";
    if (reason.startsWith("manual:")) return "Undantaget för hand: " + reason.slice(7).trim();
    if (reason.includes("not found")) return "Riskavsnittet hittades inte båda åren";
    if (reason.includes("report missing")) return "Årsredovisningen saknas för ett av åren";
    if (reason.includes("report partial")) return "Filen för ett av åren innehåller bara en del av årsredovisningen (oftast bara de finansiella rapporterna)";
    const flags = (reason.split(":")[1] || "").split(",").map((f) => f.trim()).filter(Boolean);
    const words = [...new Set(flags.map((f) => FLAG[f] || f))];
    return "Inte jämförbart: " + words.join("; ");
  }

  const ranked = R.companies.slice().sort((a, b) => a.rank - b.rank);
  ranked.forEach((c) => (c.id = idOf(c.name)));
  R.excluded.forEach((c) => (c.id = idOf(c.name)));
  const scores = ranked.map((c) => c.risk_change);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // ── page frame ─────────────────────────────────────────────────
  function setNav(view) {
    document.querySelectorAll(".nav a").forEach((a) => {
      if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    window.scrollTo(0, 0);
    if (h.startsWith("bolag-")) {
      const id = h.slice(6);
      const c = ranked.find((x) => x.id === id) || R.excluded.find((x) => x.id === id);
      setNav("ranking");
      return c ? renderCompany(c) : renderHome();
    }
    if (h === "metod") { setNav("metod"); return renderMethod(); }
    if (h === "om") { setNav("om"); return renderAbout(); }
    setNav("ranking");
    renderHome();
  }

  // ── home: headline, key numbers, themes, ranking, excluded ─────
  const state = { sort: "rank", dir: 1, q: "", sector: "", segment: "" };

  function renderHome() {
    document.title = "Ändringsskärmen";
    const sectors = [...new Set(ranked.map((c) => c.sector).filter(Boolean))].sort((a, b) => sectorSv(a).localeCompare(sectorSv(b), "sv"));
    const segments = [...new Set(ranked.map((c) => c.segment).filter(Boolean))].sort();
    app.innerHTML = `
      ${trendsBlock()}
      <section class="section" id="ranking">
        <div class="section-head"><h2>Mest omskrivna riskavsnitt</h2>
          <p class="muted">Andelen ord i riskavsnittet som ligger i meningar som är nya, borttagna eller omskrivna. 0 % betyder samma text, 100 % att inget finns kvar. Snitt för de ${ranked.length} bolagen: ${pct(avg)}.
          "Ändringen är" bygger på en genomläsning av båda årens avsnitt. Klicka på ett bolag för vad som ändrades, och på en kolumnrubrik för att sortera.</p></div>
        <div class="controls">
          <label class="field"><span class="label">Sök bolag</span><input id="q" type="search" value="${esc(state.q)}" placeholder="t.ex. Volvo"></label>
          <label class="field"><span class="label">Sektor</span><select id="sector"><option value="">Alla</option>${sectors.map((s) => `<option value="${esc(s)}"${state.sector === s ? " selected" : ""}>${esc(sectorSv(s))}</option>`).join("")}</select></label>
          <label class="field"><span class="label">Segment</span><select id="segment"><option value="">Alla</option>${segments.map((s) => `<option${state.segment === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
          <span class="count" id="count"></span>
        </div>
        <div class="table-wrap"><table id="rank-table">
          <thead><tr>
            <th class="sortable r" data-k="rank" tabindex="0">#</th>
            <th class="sortable" data-k="name" tabindex="0">Bolag</th>
            <th class="sortable" data-k="sector" tabindex="0">Sektor</th>
            <th class="sortable" data-k="segment" tabindex="0">Segment</th>
            <th class="sortable r" data-k="risk_change" tabindex="0">Riskavsnitt</th>
            <th class="sortable" data-k="driver" tabindex="0">Ändringen är</th>
            <th class="sortable r" data-k="ceo_change" tabindex="0">VD-ord</th>
          </tr></thead><tbody></tbody></table></div>
        <p class="small muted">VD-ordet skrivs om nästan helt varje år hos de flesta bolag, så den siffran säger mindre än riskavsnittets. Tomt (–) betyder att VD-ordet inte kunde jämföras.</p>
      </section>
      <section class="section excluded">
        <div class="section-head"><h2>Ej med i rankingen</h2>
          <p class="muted">${R.excluded.length} bolag är inte rankade, med skälet utskrivet. Hellre färre bolag med siffror som går att lita på. Nyckeltalen finns ändå på bolagssidan.</p></div>
        <div class="table-wrap"><table><thead><tr><th>Bolag</th><th>Sektor</th><th>Skäl</th></tr></thead><tbody>
          ${R.excluded.slice().sort((a, b) => a.name.localeCompare(b.name, "sv")).map((e) => `<tr><td><a class="rowlink" href="#bolag-${e.id}">${esc(e.name)}</a></td><td>${esc(sectorSv(e.sector))}</td><td>${esc(reasonSv(e.reason))}</td></tr>`).join("")}
        </tbody></table></div>
      </section>`;
    const q = document.getElementById("q"), se = document.getElementById("sector"), sg = document.getElementById("segment");
    q.addEventListener("input", () => { state.q = q.value; fillTable(); });
    se.addEventListener("change", () => { state.sector = se.value; fillTable(); });
    sg.addEventListener("change", () => { state.segment = sg.value; fillTable(); });
    document.querySelectorAll("#rank-table th.sortable").forEach((th) => {
      const go = () => { const k = th.dataset.k; state.dir = state.sort === k ? -state.dir : (k === "risk_change" || k === "ceo_change" ? -1 : 1); state.sort = k; fillTable(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    fillTable();
  }

  function fillTable() {
    const q = state.q.trim().toLowerCase();
    let rows = ranked.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!state.sector || c.sector === state.sector) && (!state.segment || c.segment === state.segment));
    const k = state.sort, d = state.dir;
    rows.sort((a, b) => {
      let x = a[k], y = b[k];
      if (k === "sector") { x = sectorSv(x); y = sectorSv(y); }
      if (k === "driver") { x = DRIVER_ORDER.indexOf(a.analysis?.driver); y = DRIVER_ORDER.indexOf(b.analysis?.driver); }
      if (x == null && y == null) return a.rank - b.rank;
      if (x == null) return 1;                      // empty values last, whatever the direction
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y, "sv") : x - y) * d || a.rank - b.rank;
    });
    document.querySelectorAll("#rank-table th.sortable").forEach((th) => {
      if (th.dataset.k === k) th.setAttribute("aria-sort", d > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
    });
    const bar = (v) => v == null ? "–" : `<span class="score"><span class="num">${pct(v)}</span><span class="track" aria-hidden="true"><span class="fill" style="width:${(v * 100).toFixed(1)}%"></span></span></span>`;
    document.querySelector("#rank-table tbody").innerHTML = rows.map((c) => `
      <tr><td class="r num">${c.rank}</td>
        <td><a class="rowlink" href="#bolag-${c.id}">${esc(c.name)}</a></td>
        <td>${esc(sectorSv(c.sector))}</td><td>${esc(c.segment || "–")}</td>
        <td class="r">${bar(c.risk_change)}</td>
        <td>${driverChip(c.analysis)}</td>
        <td class="r num">${pct(c.ceo_change)}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="muted">Inget bolag matchar sökningen.</td></tr>`;
    document.getElementById("count").textContent = `${rows.length} av ${ranked.length} bolag`;
  }

  // what the scores consist of: driver per company, from the read-through, top 20 and all ranked
  function driversBlock() {
    const read = ranked.filter((c) => c.analysis && DRIVER[c.analysis.driver]);
    if (read.length < ranked.length / 2) return "";
    const top = ranked.slice(0, 20);
    const count = (arr) => Object.fromEntries(DRIVER_ORDER.map((d) => [d, arr.filter((c) => c.analysis?.driver === d).length]));
    const row = (lbl, arr) => {
      const n = count(arr), tot = arr.length;
      return `<div class="drow"><span class="dlbl">${lbl}</span><span class="dbar" role="img" aria-label="${DRIVER_ORDER.map((d) => `${DRIVER[d][0]} ${n[d]}`).join(", ")}">
        ${DRIVER_ORDER.filter((d) => n[d]).map((d) => `<span class="seg d-${d}" style="flex:${n[d]}" title="${DRIVER[d][0]}: ${n[d]} av ${tot}">${n[d]}</span>`).join("")}</span></div>`;
    };
    return `<section class="section">
      <div class="section-head"><h2>Vad poängen består av</h2>
        <p class="muted">Båda årens riskavsnitt är lästa för vart och ett av de ${ranked.length} rankade bolagen. Ändringen är klassad efter vad den mest består av. Antal bolag:</p></div>
      <div class="drivers">
        ${row("De 20 högsta", top)}${row(`Alla ${ranked.length}`, ranked)}
        <div class="dlegend">${DRIVER_ORDER.map((d) => `<span><span class="sw d-${d}"></span>${DRIVER[d][0]}: ${esc(DRIVER[d][1])}</span>`).join("")}</div>
      </div></section>`;
  }

  // ── risk themes 2024 → 2025 (scripts/08_themes.py) ─────────────
  // Measured on the sentences that were added or removed in the risk section. Every one of them is
  // labelled with a theme and with whether it describes a risk or what the company does about it.
  // A company counts as "more" on a theme when it added at least min_words more words of risk text
  // on it than it removed (and "less" the other way round).
  const T = R.trends;
  const coName = (slug, t) => T.themes[t].per_company[slug]?.name || slug;
  const coLink = (name) => `<a href="#bolag-${idOf(name)}">${esc(name)}</a>`;
  // companies whose read-through says sustainability risks were moved out of the risk section
  // (a finding that mentions both moving/referring and sustainability). Only applied to the
  // themes that sustainability reports cover, so a drop there is not read as a smaller risk.
  const RELOCATED = (f) => /flytta|hänvis/i.test(f.h + " " + f.p) && /hållbarhet/i.test(f.h + " " + f.p);
  const SUSTAINABILITY_THEMES = new Set(["Climate and environment", "Reputation and ethics", "People and skills"]);
  const moved = (names) => names.filter((n) => { const c = ranked.find((x) => x.name === n); return (c?.analysis?.findings || []).some(RELOCATED); });

  function trendRows() {
    return Object.entries(T.themes).map(([k, v]) => ({ k, v, more: v.companies_more.length, less: v.companies_less.length }))
      .filter((r) => r.more + r.less > 0)
      .sort((a, b) => (b.more - b.less) - (a.more - a.less) || b.more - a.more);
  }

  // short statements written from the numbers: clear rises and clear falls only
  function trendStatements(rows) {
    const up = rows.filter((r) => r.more >= 5 && r.more >= 2 * Math.max(r.less, 1));
    const down = rows.filter((r) => r.less >= 5 && r.less >= 2 * Math.max(r.more, 1));
    const li = [];
    up.forEach((r) => li.push(`<li><strong>${esc(themeSv(r.k))}:</strong> ${r.more} bolag skrev mer om risken, ${r.less} mindre.</li>`));
    down.forEach((r) => {
      const names = r.v.companies_less.map((s) => coName(s, r.k));
      const rel = SUSTAINABILITY_THEMES.has(r.k) ? moved(names) : [];
      li.push(`<li><strong>${esc(themeSv(r.k))}:</strong> ${r.less} bolag skrev mindre om risken, ${r.more} mer.${
        rel.length ? ` Hos ${rel.length} av de ${r.less} visar genomläsningen att hållbarhetsriskerna flyttats ut ur riskavsnittet, oftast till hållbarhetsrapporten. En del av minskningen är alltså flyttad text, inte en mindre risk.` : ""}</li>`);
    });
    return li.length ? `<ul class="statements">${li.join("")}</ul>` : "";
  }

  function trendsBlock() {
    if (!T) return "";
    const rows = trendRows();
    const max = Math.max(1, ...rows.map((r) => Math.max(r.more, r.less)));
    const w = (n) => `${(n / max * 100).toFixed(1)}%`;
    const weak = new Set((T.meta.per_theme || []).filter((p) => p.recall_model < 0.5).map((p) => p.theme));
    const quote = (e) => `<li><span class="t">${esc(e.text)}</span> <span class="who">${coLink(e.name)}</span></li>`;
    const detail = (r) => {
      const v = r.v;
      const names = (arr) => arr.map((s) => coLink(coName(s, r.k))).join(", ") || "–";
      return `<div class="tdetail">
        <p>${r.more} bolag lade till mer risktext om ${esc(themeSv(r.k).toLowerCase())} än de strök, ${r.less} strök mer än de lade till.
          Totalt tillkom ${num(v.risk_words_added)} ord risktext och ${num(v.risk_words_removed)} ord togs bort.
          Text om vad bolagen gör åt risken: +${num(v.mitigation_words_added)} / −${num(v.mitigation_words_removed)} ord.</p>
        <div class="two">
          <div><span class="label">Mer ${Y1}</span><p>${names(v.companies_more)}</p></div>
          <div><span class="label">Mindre ${Y1}</span><p>${names(v.companies_less)}</p></div>
        </div>
        ${v.examples_added.length ? `<div class="sentences sent-add"><h4>Nytt ${Y1}</h4><ol>${v.examples_added.slice(0, 4).map(quote).join("")}</ol></div>` : ""}
        ${v.examples_removed.length ? `<div class="sentences sent-rem"><h4>Struket sedan ${Y0}</h4><ol>${v.examples_removed.slice(0, 3).map(quote).join("")}</ol></div>` : ""}
        <p class="small muted">Området utgör ${pct(v.level_share_new)} av risktexten ${Y1} i snitt per bolag${weak.has(r.k) ? " (modellens skattning; för det här området hittar modellen under hälften av meningarna, så andelen är för låg)" : " (modellens skattning)"}.</p>
      </div>`;
    };
    return `<section class="hero">
        <h1>Vilka risker skriver börsbolagen <ins>mer</ins> om, och vilka <del>mindre</del>?</h1>
        <p class="lead">Riskavsnitten i ${ranked.length} svenska börsbolags årsredovisningar för ${Y1}, jämförda med ${Y0}. Alla ${num(T.meta.n_changed)} meningar som tillkommit eller strukits är sorterade på riskområde, och på om de beskriver en risk eller vad bolaget gör åt den.</p>
      </section>
      ${trendStatements(rows)}
      <section class="section" id="omraden">
        <div class="section-head"><h2>Riskområden ${Y0} → ${Y1}</h2>
          <p class="muted">Antal bolag som lagt till minst ${T.meta.min_words} ord mer risktext om området än de strukit (höger), eller tvärtom (vänster). Klicka på ett område för bolagen och citat ur rapporterna.</p></div>
        <div class="themes">
          <div class="theme-legend"><span>Mindre risktext</span><span></span><span>Mer risktext</span></div>
          ${rows.map((r) => `<details class="trow"><summary class="theme-row">
            <div class="less"><span class="num">${r.less || ""}</span><span class="bar" style="width:${w(r.less)}"></span></div>
            <div class="name">${esc(themeSv(r.k))}</div>
            <div class="more"><span class="bar" style="width:${w(r.more)}"></span><span class="num">${r.more || ""}</span></div>
          </summary>${detail(r)}</details>`).join("")}
        </div>
        <p class="note"><strong>Första version.</strong> Riskområdena bygger på enskilda meningar som sorterats utan sammanhanget runt dem. En mening som bara säger att något "kan påverka verksamheten negativt" hamnar då under Övrigt, även om den hör till en viss risk. Siffrorna per område är därför mindre säkra än rankingen och genomläsningarna längre ner.</p>
        <p class="small muted">Bara meningar som tillkommit eller strukits räknas; text som står kvar oförändrad tar ut sig själv. Ett bolag kan räknas på flera områden. Siffrorna säger vad bolagen skriver, inte hur stora riskerna är. <a href="#metod">Så är meningarna sorterade</a>.</p>
      </section>`;
  }

  // ── company page ───────────────────────────────────────────────
  function renderCompany(c) {
    document.title = `${c.name} – Ändringsskärmen`;
    const isRanked = c.rank != null;
    const meta = [sectorSv(c.sector), c.segment, c.ticker].filter((x) => x && x !== "–").map(esc).join(" · ");
    let body = `<a class="back" href="#ranking">← Till översikten</a>
      <header class="co-head"><h1>${esc(c.name)}</h1><div class="co-meta">${meta}${isRanked ? ` · plats ${c.rank} av ${ranked.length}` : ""}
        ${c.notes && c.notes.includes("located_by_model") ? '<span class="chip model">Riskavsnittet hittat av modell</span>' : ""}
        ${c.analysis ? driverChip(c.analysis) : ""}</div></header>`;
    if (!isRanked) {
      body += `<div class="note"><strong>Inte rankat.</strong> ${esc(reasonSv(c.reason))}.</div>`;
      body += analysisBlock(c);
      body += financialsBlock(c);
      app.innerHTML = body;
      return;
    }
    if (c.notes.includes("located_by_model")) {
      body += `<div class="note">Rapporten saknar en rubrik som skriptet känner igen. Riskavsnittet har därför hittats av en modell som lärt sig hur riskavsnitt ser ut i de rapporter där rubriken fanns. Samma regel används båda åren.</div>`;
    }
    if (c.notes.includes("approved_by_hand")) {
      body += `<p class="small muted">Nästan hela avsnittet är nytt, vilket oftare beror på ny layout än på nya risker. Därför rankas ett sådant bolag först när båda årens avsnitt är lästa och avsnittets början och slut är kontrollerade mot rapporten (approved.csv). Genomläsningen nedan säger vad ändringen består av.</p>`;
    }
    if (c.notes.includes("manual_override")) {
      body += `<p class="small muted">Riskavsnittets början och slut är kontrollerade mot rapporten och satta för hand, på samma sätt båda åren (data/sections/overrides.csv).</p>`;
    }
    body += analysisBlock(c);
    const rew = (c.risk_added_share ?? 0) >= 0.6 && (c.risk_removed_share ?? 0) >= 0.6;
    body += `<section class="panel">
        <div class="score-big">
          <div><span class="label">Riskavsnittet, ändring ${Y0}→${Y1}</span><div class="v">${pct(c.risk_change)}</div></div>
          <div class="parts">
            <div class="add"><span class="label">Ny text ${Y1}</span><span class="v">${pct(c.risk_added_share)}</span></div>
            <div class="rem"><span class="label">Borttagen text</span><span class="v">${pct(c.risk_removed_share)}</span></div>
            <div><span class="label">VD-ordet</span><span class="v">${pct(c.ceo_change)}</span></div>
          </div>
        </div>
        ${strip(c)}
        <p class="summary">${pct(c.risk_change)} av orden i riskavsnittet ligger i meningar som är nya, borttagna eller omskrivna.
          ${num(c.n_added)} meningar har tillkommit, ${num(c.n_removed)} har tagits bort och ${num(c.n_edited)} har skrivits om.
          Avsnittet gick från ${num(c.words_2024)} till ${num(c.words_2025)} ord.
          ${rew ? "Det mesta av avsnittet är omskrivet. Det betyder inte att alla risker är nya: samma risker kan vara beskrivna med nya ord." : ""}
          ${c.risk_change < 0.03 ? "Det är nära mätbruset; texten är i praktiken oförändrad." : ""}</p>
        <p class="small muted">Samma text med andra radbrytningar ger ${pct(c.risk_layout_noise)}, det är mätbruset för det här bolaget. Andelarna ny och borttagen text räknas på respektive års ord, därför summerar de inte till totalen.</p>
      </section>`;
    body += `<div class="two">${themesCo(c)}${toneBlock(c)}</div>`;
    body += sentencesBlock(c);
    body += financialsBlock(c);
    app.innerHTML = body;
  }

  // read-through of both risk sections (analyses/<company>.json): what the change consists of
  function analysisBlock(c) {
    const a = c.analysis;
    if (!a) return "";
    const d = DRIVER[a.driver];
    return `<section class="analysis">
      <div class="analysis-head">
        <span class="label">Genomläsning av riskavsnitten ${Y0} och ${Y1}</span>
        <h2>${esc(a.headline)}</h2>
        ${d ? `<div class="driver-row">${driverChip(a)}<span class="small muted">${esc(d[1])}</span></div>` : ""}
      </div>
      <ol class="findings">
        ${(a.findings || []).map((f) => `<li class="finding"><span class="ftag t-${esc(f.t)}">${esc(FTYPE[f.t] || f.t)}</span>
          <div><h3>${esc(f.h)}</h3><p>${esc(f.p)}</p></div></li>`).join("")}
      </ol>
      ${a.figures ? `<div class="figures"><span class="label">I årsredovisningen ${Y1}</span><p>${esc(a.figures)}</p></div>` : ""}
      <p class="small muted">Underlag: ${esc(a.basis)} Läst ${esc(a.written)}, skrivet med hjälp av AI (Claude). Varje citat och varje siffra är kontrollerad mot rapporttexten (scripts/07_check_analyses.py).
        ${a.checked ? `Varje påstående är dessutom kontrollerat mot båda årens riskavsnitt i en separat granskning (${esc(a.checked)}).` : `<strong>Påståendena är ännu inte granskade en andra gång mot riskavsnitten.</strong>`} Ingen investeringsrådgivning.</p>
    </section>`;
  }

  // dot strip: every ranked company on one 0–100 % line, this one highlighted
  function strip(c) {
    const W = window.innerWidth < 600 ? 360 : 640, H = 64, x0 = 16, x1 = W - 16, y = 34;   // narrower drawing on phones keeps the labels readable
    const X = (v) => x0 + v * (x1 - x0);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<line class="axis" x1="${X(t)}" x2="${X(t)}" y1="${y + 8}" y2="${y + 12}"/><text x="${X(t)}" y="${y + 26}" text-anchor="middle">${t * 100} %</text>`).join("");
    const dots = ranked.filter((o) => o !== c).map((o, i) => `<circle class="dot" cx="${X(o.risk_change).toFixed(1)}" cy="${y + ((i % 3) - 1) * 4}" r="3.5"/>`).join("");
    const lx = Math.min(Math.max(X(c.risk_change), 70), W - 70);
    return `<div class="strip"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)} jämfört med alla ${ranked.length} rankade bolag">
      <line class="axis" x1="${x0}" x2="${x1}" y1="${y + 8}" y2="${y + 8}"/>${ticks}${dots}
      <circle class="me" cx="${X(c.risk_change).toFixed(1)}" cy="${y}" r="6"/>
      <text class="me-label" x="${lx}" y="${y - 14}" text-anchor="middle">${esc(c.name)} ${pct(c.risk_change)}</text></svg></div>`;
  }

  // themes for one company: from the hand-labelled added/removed sentences when step 8 has run
  function themesCo(c) {
    if (T) {
      const rows = Object.entries(T.themes).map(([k, v]) => {
        const p = Object.values(v.per_company).find((x) => x.name === c.name);
        return p && { k, add: p.risk_added, rem: p.risk_removed, net: p.risk_added - p.risk_removed };
      }).filter(Boolean);
      const m = T.meta.min_words;
      const li = (arr) => arr.length ? `<ul>${arr.map((x) => `<li><span>${esc(themeSv(x.k))}</span><span class="num small muted">+${num(x.add)} / −${num(x.rem)} ord</span></li>`).join("")}</ul>` : `<p class="muted small">Inget område.</p>`;
      return `<section class="panel themes-co"><h3>Riskområden</h3>
        <div><span class="label">Mer risktext ${Y1}</span>${li(rows.filter((x) => x.net >= m).sort((a, b) => b.net - a.net))}</div>
        <div><span class="label">Mindre risktext ${Y1}</span>${li(rows.filter((x) => -x.net >= m).sort((a, b) => a.net - b.net))}</div>
        <p class="small muted">Ord i tillkomna (+) och strukna (−) meningar som beskriver en risk inom området. Minst ${m} ord netto för att räknas.</p></section>`;
    }
    const t = c.themes;
    if (!t) return "";
    const li = (arr) => arr.length ? `<ul>${arr.map((x) => `<li><span>${esc(themeSv(x.theme))}</span><span class="num small muted">+${num(x.added_words)} / −${num(x.removed_words)} ord</span></li>`).join("")}</ul>` : `<p class="muted small">Inget område sticker ut.</p>`;
    return `<section class="panel themes-co"><h3>Riskområden</h3>
      <div><span class="label">Mer text ${Y1}</span>${li(t.more_text_on)}</div>
      <div><span class="label">Mindre text ${Y1}</span>${li(t.less_text_on)}</div>
      <p class="small muted">Ord i tillkomna (+) och borttagna (−) meningar som nämner området.</p></section>`;
  }

  function toneBlock(c) {
    const t = c.tone_risk;
    if (!t) return "";
    const row = (lbl, k, d = 2) => `<tr><td>${lbl}</td><td class="r num">${num(t[Y0]?.[k], d)}</td><td class="r num">${num(t[Y1]?.[k], d)}</td></tr>`;
    const ch = t.change || {};
    return `<section class="panel"><h3>Ton i riskavsnittet</h3>
      <div class="table-wrap"><table><thead><tr><th>Ord per 100 ord</th><th class="r">${Y0}</th><th class="r">${Y1}</th></tr></thead><tbody>
        ${row("Negativa", "negative")}${row("Positiva", "positive")}${row("Osäkerhet", "uncertainty")}${row("Svaga modala (kan, skulle)", "weak_modal")}
        <tr><td>Nettoton (−1 till +1)</td><td class="r num">${num(t[Y0]?.net_tone, 2)}</td><td class="r num">${num(t[Y1]?.net_tone, 2)}</td></tr>
      </tbody></table></div>
      <p class="small muted">I den nya texten: ${num(ch.negative_added, 2)} negativa ord per 100 (i den borttagna: ${num(ch.negative_removed, 2)}).
        Svenska ordlistor byggda på Loughran & McDonalds kategorier. Ordlistor läser inte sammanhang.</p></section>`;
  }

  function sentencesBlock(c) {
    const add = c.added || [], rem = c.removed || [], ed = c.edited || [];
    const lst = (arr, cls) => arr.length ? `<ol class="${cls}">${arr.map((s) => `<li><span class="t">${esc(s)}</span></li>`).join("")}</ol>` : `<p class="muted">Inga.</p>`;
    return `<section class="section">
      <div class="section-head"><h2>Vad som ändrades</h2>
        <p class="muted">Meningarna på originalspråket, i den ordning de står i rapporten. Visas: de ${add.length} tydligaste nya och ${rem.length} tydligaste borttagna (av ${num(c.n_added)} och ${num(c.n_removed)}).</p></div>
      <div class="two">
        <div class="sentences sent-add"><h3>Nytt ${Y1}</h3>${lst(add)}</div>
        <div class="sentences sent-rem"><h3>Borttaget sedan ${Y0}</h3>${lst(rem)}</div>
      </div>
      ${ed.length ? `<details class="more"><summary>Omskrivna meningar (${ed.length} av ${num(c.n_edited)})</summary>
        <div class="edits">${ed.map((p) => { const [a, b] = wordDiff(p.before, p.after); return `<div class="edit"><span class="label lbl">${Y0}</span><div>${a}</div><span class="label lbl">${Y1}</span><div>${b}</div></div>`; }).join("")}</div></details>` : ""}
    </section>`;
  }

  // word-level "track changes" for an edited sentence (longest common subsequence of words)
  function wordDiff(a, b) {
    const A = a.split(/\s+/), B = b.split(/\s+/), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const outA = [], outB = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { outA.push(esc(A[i])); outB.push(esc(B[j])); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { outA.push(`<del>${esc(A[i])}</del>`); i++; }
      else { outB.push(`<ins>${esc(B[j])}</ins>`); j++; }
    }
    while (i < n) outA.push(`<del>${esc(A[i++])}</del>`);
    while (j < m) outB.push(`<ins>${esc(B[j++])}</ins>`);
    return [outA.join(" "), outB.join(" ")];
  }

  function financialsBlock(c) {
    const f = c.financials;
    if (!f || (!f[Y0] && !f[Y1])) return `<section class="panel"><h3>Nyckeltal</h3><p class="muted">Inga nyckeltal kunde läsas ur rapporten.</p></section>`;
    const cur = f.currency || "SEK", a = f[Y0] || {}, b = f[Y1] || {};
    const M = `M${cur}`;
    const rows = [
      ["Nettoomsättning", "revenue_m", (v) => num(v) + " " + M],
      ["Omsättningstillväxt", "revenue_growth", (v) => pct(v)],
      ["Rörelseresultat (EBIT)", "ebit_m", (v) => num(v) + " " + M],
      ["Rörelsemarginal", "ebit_margin", (v) => pct(v)],
      ["Resultat efter skatt", "net_profit_m", (v) => num(v) + " " + M],
      ["Resultat per aktie", "eps", (v) => num(v, 2) + " " + cur],
      ["Kassaflöde från löpande verksamhet", "operating_cash_flow_m", (v) => num(v) + " " + M],
      ["Soliditet", "equity_ratio", (v) => pct(v)],
      ["Avkastning på eget kapital", "return_on_equity", (v) => pct(v)],
      ["Nettoskuld*", "net_debt_m", (v) => num(v) + " " + M],
      ["Föreslagen utdelning per aktie", "dividend_per_share", (v, r) => num(v, 2) + " " + (r.dividend_currency || cur) + (r.dividend_extra ? ` (varav extra ${num(r.dividend_extra, 2)})` : "")],
      ["Medelantal anställda", "employees", (v) => num(v)],
    ];
    const cell = (r, k, fmt) => (r[k] == null ? "–" : fmt(r[k], r));
    const other = (b.revenue_source || a.revenue_source);
    return `<section class="panel"><h3>Nyckeltal</h3>
      <div class="table-wrap"><table><thead><tr><th></th><th class="r">${Y0}</th><th class="r">${Y1}</th></tr></thead><tbody>
        ${rows.filter(([, k]) => a[k] != null || b[k] != null).map(([lbl, k, fmt]) => `<tr><td>${lbl}</td><td class="r num">${cell(a, k, fmt)}</td><td class="r num">${cell(b, k, fmt)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted">Lästa ur de maskinläsbara taggarna (XBRL) i årsredovisningen, koncernen. *Nettoskuld är vår beräkning: lån + leasingskulder − kassa; bolagens egna definitioner kan skilja sig.
        ${other ? `Omsättningen är taggad som <code>${esc(other)}</code>, inte som standardtaggen för nettoomsättning.` : ""}
        ${b.revenue_m == null && a.revenue_m == null ? "Ingen omsättning visas, t.ex. för investmentbolag." : ""}</p></section>`;
  }

  // ── method and about ───────────────────────────────────────────
  function renderMethod() {
    document.title = "Metod – Ändringsskärmen";
    const t = R.meta.sentence_threshold?.risk ?? 0.5;
    app.innerHTML = `<article class="prose">
      <h1>Metod</h1>
      <h2>Frågan</h2>
      <p>Hur mycket ändrade svenska börsbolag texten i riskavsnittet i årsredovisningen mellan räkenskapsåren ${Y0} och ${Y1}, och vad ändrade de? Forskning på amerikanska bolag (Cohen, Malloy och Nguyen, "Lazy Prices", 2020) visar att bolag sällan ändrar sina rapporter, och att ändringarna i riskavsnittet bär mest information.</p>
      <h2>Data</h2>
      <p>Årsredovisningarna i det digitala formatet ESEF som bolagen lämnar till Finansinspektionen: ${Y0} via filings.xbrl.org, ${Y1} som bilaga till bolagets pressmeddelande. Urvalet är ${ranked.length + R.excluded.length} bolag på Large och Mid Cap. Banker är inte med ännu; deras risktext ser annorlunda ut. ${R.excluded.length} bolag är inte rankade, med skälet utskrivet på startsidan.</p>
      <h2>Så hittas riskavsnittet</h2>
      <p>Först via rapportens innehållsförteckning och sidnummer, annars via rubriker som "Risker och riskhantering". De två åren skärs med samma rubriker. Avsnittet slutar vid nästa del av rapporten: en rubrik som "Forskning och utveckling", "Aktien", "Ordföranden har ordet" eller "Hållbarhetsrapport" klipper avsnittet, om texten efter rubriken nästan inte nämner risk. Klipps det ena året vid en rubrik klipps det andra året vid samma rubrik.</p>
      <p>Där ingen rubrik fungerar letar en modell (logistisk regression på ordens förekomst) upp avsnittet; den har lärt sig hur riskavsnitt ser ut i de rapporter där rubriken fanns. För ${ranked.filter((c) => c.notes.includes("manual_override")).length} av de rankade bolagen är avsnittets början och slut sedan kontrollerade mot rapporten och satta för hand, på samma sätt båda åren. De är märkta "Kanter kontrollerade" på bolagssidan.</p>
      <p>PDF-filer skriver ofta "fi", "ff" och "tt" som ett tecken (ligatur). Utan rättning blir "effekt" och "eﬀekt" två olika ord, och en oförändrad mening ser ändrad ut när bara det ena årets PDF använder ligaturer. Tecknen översätts därför tillbaka till bokstäver innan texterna jämförs.</p>
      <p>Vissa PDF-filer lägger bindestrecket i ett avstavat ord på en egen rad ("rappor", "-", "tering"). Då blir ordet två ord, och en oförändrad mening ser ändrad ut när det andra året bryter raden på ett annat ställe. Sådana ord fogas ihop innan texterna jämförs.</p>
      <h2>Så räknas poängen</h2>
      <p>Texten delas i meningar. Varje mening ${Y1} paras med den mest lika meningen ${Y0}, oavsett ordning, så flyttade stycken räknas inte som ändring. Paren jämförs ord för ord. Har minst ${Math.round(t * 100)} % av orden en motsvarighet räknas meningen som omskriven och bara de ändrade orden räknas; annars är den ny eller borttagen och alla ord räknas. Poängen är ändrade ord delat med alla ord, båda åren. Siffror räknas inte.</p>
      ${checksBlock()}
      <h2>Genomläsning</h2>
      <p>En hög poäng säger att texten ändrats, inte vad som ändrats. Därför är båda årens riskavsnitt lästa för varje rankat bolag, och ändringen klassad efter vad den mest består av:</p>
      <dl class="kv">${DRIVER_ORDER.map((d) => `<dt>${DRIVER[d][0]}</dt><dd>${esc(DRIVER[d][1])}</dd>`).join("")}</dl>
      ${driverTally()}
      <p>Varje genomläsning anger de konkreta ändringarna: nya och borttagna risker, skärpta och nedtonade formuleringar och ändrad struktur. Varje citat och varje siffra i texten kontrolleras automatiskt mot rapporterna.</p>
      <p>Därefter granskas varje genomläsning en andra gång, påstående för påstående, av en separat granskare som inte skrev den: antal risker, vad som är nytt (får inte finnas året innan), vad som är struket (får inte finnas året efter) och om klassningen stämmer. Fel rättas. ${(() => { const n = ranked.filter((c) => c.analysis?.checked).length; return n === ranked.length ? `Alla ${n} genomläsningar är granskade på det sättet. Granskningen hittade och rättade omkring 75 felaktiga eller för breda påståenden, oftast något som kallades nytt fast det fanns redan året innan.` : `${n} av ${ranked.length} genomläsningar är granskade på det sättet; de övriga är märkta på bolagssidan.`; })()}</p>
      ${driversBlock()}
      ${classifierBlock()}
      <h2>Ton och nyckeltal</h2>
      <p>Tonen mäts med svenska ordlistor byggda på Loughran och McDonalds (2011) kategorier: negativa ord, positiva ord, osäkerhet. Nyckeltalen läses direkt ur rapportens XBRL-taggar.</p>
      <h2>Begränsningar</h2>
      <p>En mening som skrivs om med helt nya ord räknas som en ny och en borttagen; genomläsningen visar var det har hänt ("Omformulering"). Bolag där nästan allt är nytt, eller där avsnittet är mycket längre det ena året, rankas inte utan kontroll. Ordlistorna för ton är mina översättningar, inte en validerad svensk ordlista. Meningarna är sorterade med hjälp av AI efter en skriven instruktion; en sorterare som läser instruktionen annorlunda flyttar en del meningar mellan närliggande områden. Poängen mäter förändring i text. Jag har inte prövat om den förutsäger avkastning.</p>
      <h2>Referenser</h2>
      <p class="small">Cohen, L., Malloy, C. och Nguyen, Q. (2020), Lazy Prices, Journal of Finance. Brown, S. och Tucker, J. (2011), Large-sample evidence on firms' year-over-year MD&A modifications, Journal of Accounting Research. Loughran, T. och McDonald, B. (2011), When is a liability not a liability?, Journal of Finance. Campbell, J. m.fl. (2014), The information content of mandatory risk factor disclosures, Review of Accounting Studies.</p>
      <p class="small muted">Data skapad ${esc(R.meta.generated)}.</p>
    </article>`;
  }

  // robustness of the score, computed by scripts/05_export.py on the ranked companies
  function checksBlock() {
    const k = R.meta.checks;
    if (!k) return "";
    return `<h2>Kontroll av poängen</h2>
      <p>Rangkorrelation (Spearman, 1 = samma ordning) för de ${k.n} rankade bolagen:</p>
      <div class="table-wrap"><table><tbody>
        <tr><td>Gränsen för omskriven mening ${Math.round(t0() * 100 - 10)} % i stället för ${Math.round(t0() * 100)} %</td><td class="r num">${num(k.threshold_minus_0_10, 2)}</td></tr>
        <tr><td>Gränsen ${Math.round(t0() * 100 + 10)} % i stället för ${Math.round(t0() * 100)} %</td><td class="r num">${num(k.threshold_plus_0_10, 2)}</td></tr>
        <tr><td>Ett annat mått: 1 − cosinuslikhet (TF-IDF) mellan åren</td><td class="r num">${num(k.cosine_change, 2)}</td></tr>
        <tr><td>Avsnittets längd</td><td class="r num">${num(k.section_length, 2)}</td></tr>
      </tbody></table></div>
      <p>Rankingen hänger inte på var gränsen dras, ett enklare mått ger nästan samma ordning, och långa eller korta avsnitt får inte höga poäng av sig själva. Samma text med andra radbrytningar ger högst ${pct(k.layout_noise_max)}: det är mätbruset.</p>`;
  }
  // how the sentences were sorted into risk themes (scripts/08_themes.py)
  function classifierBlock() {
    if (!T) return "";
    const a = T.meta.accuracy;
    return `<h2>Riskområden: så är meningarna sorterade</h2>
      <p>Varje mening i riskavsnitten får två etiketter: ett av ${Object.keys(T.themes).length} riskområden (eller Övrigt), och om meningen beskriver en <em>risk</em>, en <em>åtgärd</em> (vad bolaget gör åt risken) eller <em>annat</em> (rubriker, definitioner, hur riskarbetet är organiserat). Reglerna står i en skriven instruktion (data/labels/GUIDE.md).</p>
      <p>${num(a.n_labels)} meningar från ${a.n_companies} bolag är sorterade enligt instruktionen med hjälp av AI (Claude). Bland dem finns alla ${num(T.meta.n_changed)} meningar som tillkommit eller strukits. Trenderna på startsidan bygger bara på dem, så de beror inte på någon modell.</p>
      <p>Med de sorterade meningarna är en modell tränad (logistisk regression på bokstavsföljder i meningen och meningen före) som sorterar de övriga av de ${num(T.meta.n_sentences)} meningarna. Den används bara till hur stor andel av risktexten ${Y1} ett område utgör. Modellen är prövad på ${num(a.n_eval)} slumpvis valda meningar, med bolagen uppdelade så att den aldrig prövas på ett bolag den tränats på:</p>
      <div class="table-wrap"><table><tbody>
        <tr><td>Rätt riskområde, modellen</td><td class="r num">${pct(a.theme_model, 0)}</td></tr>
        <tr><td>Rätt riskområde, ordlistor (den lista som får flest träffar)</td><td class="r num">${pct(a.theme_wordlists_top, 0)}</td></tr>
        <tr><td>Rätt risk / åtgärd / annat, modellen</td><td class="r num">${pct(a.kind_model, 0)}</td></tr>
      </tbody></table></div>
      <p>Ordlistor räknar ord men läser inte sammanhang: "säkerhet" kan vara IT-säkerhet, säkerhet på arbetsplatsen eller en säkerhet för ett lån. Modellen väger in hela meningen och meningen före. För tullar och AI, där det finns få exempel, hittar modellen under hälften av meningarna.</p>
      <p>Två sorteringar gjorda var för sig på samma 200 meningar gav samma område för 95 % och samma risk/åtgärd/annat för 96 %. Båda gjordes av samma AI-modell, så siffran visar att instruktionen är tydlig, inte att en människa skulle sortera likadant. 100 slumpvis valda meningar kontrolleras därför för hand (data/labels/check_100.csv).</p>`;
  }
  const t0 = () => R.meta.sentence_threshold?.risk ?? 0.5;

  function driverTally() {
    const read = ranked.filter((c) => c.analysis && DRIVER[c.analysis.driver]);
    if (!read.length) return "";
    const bands = [["De 20 högsta", ranked.slice(0, 20)], ["Plats 21–40", ranked.slice(20, 40)], [`Plats 41–${ranked.length}`, ranked.slice(40)]];
    return `<div class="table-wrap"><table><thead><tr><th>Bolag</th>${DRIVER_ORDER.map((d) => `<th class="r">${DRIVER[d][0]}</th>`).join("")}</tr></thead><tbody>
      ${bands.filter(([, arr]) => arr.length).map(([lbl, arr]) => `<tr><td>${lbl}</td>${DRIVER_ORDER.map((d) => `<td class="r num">${arr.filter((c) => c.analysis?.driver === d).length}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`;
  }

  function renderAbout() {
    document.title = "Om – Ändringsskärmen";
    app.innerHTML = `<article class="prose">
      <h1>Om</h1>
      <p>Jag heter Axel Pettersson och har en masterexamen i finans från Handelshögskolan i Göteborg. I mitt examensarbete byggde jag en textanalys i Python av amerikanska bolagsrapporter. Ändringsskärmen gör samma sak för svenska årsredovisningar.</p>
      <p>Hela kedjan är skriven i Python med vanliga verktyg (requests, lxml, pandas, scikit-learn) och kan köras om när nästa års rapporter kommer. Koden visar jag gärna på begäran.</p>
      <p>Mer om mig: <a href="https://axelpettersson99.github.io/">axelpettersson99.github.io</a><br>GitHub: <a href="https://github.com/AxelPettersson99">github.com/AxelPettersson99</a><br>E-post: <a href="mailto:petterssonaxel99@gmail.com">petterssonaxel99@gmail.com</a></p>
    </article>`;
  }

  window.addEventListener("hashchange", route);
  route();
})();
