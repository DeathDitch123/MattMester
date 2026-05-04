/**
 * MattMesterHouseRules — közös "Szabályok és tudnivalók" modal.
 *
 * Auto-injektálódik minden oldalra ahol be van linkelve. Görgethető Bootstrap modal-t
 * regisztrál a body alá, és exponálja a window.MattMesterHouseRules.open() API-t.
 *
 * Issue #7 — bilingvis (HU/EN). A markup a `buildModalMarkup(lang)` lang
 * paramétere alapján generálódik. Lang-váltáskor (mm:lang-changed event)
 * a modal újra-injektálódik, így ha a user EN-re vált és kinyitja a Szabályokat,
 * teljesen angol tartalmat lát.
 */
(function initHouseRules(globalScope) {
    'use strict';

    const MODAL_ID = 'houseRulesModal';
    let injected = false;
    let injectedLang = null;

    function getCurrentLang() {
        try {
            if (globalScope.MattMesterI18n && typeof globalScope.MattMesterI18n.get === 'function') {
                return globalScope.MattMesterI18n.get();
            }
        } catch (_) { /* ignore */ }
        return 'hu';
    }

    function buildModalMarkup(lang) {
        if (lang === 'en') return buildModalMarkupEn();
        return buildModalMarkupHu();
    }

    function buildModalMarkupHu() {
        return `
        <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-labelledby="${MODAL_ID}Label" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg modal-fullscreen-sm-down">
                <div class="modal-content house-rules-modal">
                    <div class="modal-header">
                        <h5 class="modal-title d-flex align-items-center gap-2" id="${MODAL_ID}Label">
                            <span class="house-rules-modal-icon" aria-hidden="true">&#9812;</span>
                            Szabályok és tudnivalók
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Bezárás"></button>
                    </div>
                    <div class="modal-body house-rules-modal-body">
                        <nav class="house-rules-toc" aria-label="Tartalomjegyzék">
                            <a href="#hr-chess">1. Sakk szabályok</a>
                            <a href="#hr-conduct">2. Házirend</a>
                            <a href="#hr-maintenance">3. Karbantartás</a>
                            <a href="#hr-tips">4. Hasznos tudnivalók</a>
                        </nav>

                        <section id="hr-chess" class="house-rules-section">
                            <h6 class="house-rules-h6">1. Sakk szabályok</h6>
                            <p class="text-secondary small mb-3">
                                A sakk célja: a király mattolása. Két játékos váltakozva lép a 8&times;8-as táblán.
                                Aki nem tud törvényes lépést tenni úgy, hogy a királya ne legyen sakkban, vagy akinek a királyát mattolják, az veszít.
                            </p>

                            <strong class="house-rules-h7">Bábuk és lépésük</strong>
                            <ul class="house-rules-list">
                                <li><strong>Király</strong> — egy mezőt tetszőleges irányba (kivéve sakkba lépni).</li>
                                <li><strong>Vezér</strong> — tetszőleges távolság vízszintesen, függőlegesen vagy átlósan.</li>
                                <li><strong>Bástya</strong> — tetszőleges távolság vízszintesen vagy függőlegesen.</li>
                                <li><strong>Futó</strong> — tetszőleges távolság átlósan.</li>
                                <li><strong>Huszár</strong> — &quot;L&quot; alakban (2+1), átugorhat más bábukon.</li>
                                <li><strong>Gyalog</strong> — egy mezőt előre (első lépésnél 2 is), átlósan üt; idegen sorba érve átalakul.</li>
                            </ul>

                            <strong class="house-rules-h7">Speciális szabályok</strong>
                            <ul class="house-rules-list">
                                <li><strong>Sáncolás</strong> — király + bástya egy lépésben, ha egyik sem mozdult, a király nincs sakkban és nem lép át sakkos mezőn.</li>
                                <li><strong>En passant</strong> — a 2 mezős gyaloglépés ütése a következő lépésben, mintha csak 1 mezőt lépett volna.</li>
                                <li><strong>Gyaloggá-átváltozás</strong> — a 8. sorba érve a gyalog vezérré, bástyává, futóvá vagy huszárrá változik (a játékos választ).</li>
                                <li><strong>Sakk</strong> — ha a király támadás alatt van; le kell zárni vagy elmozdítani.</li>
                            </ul>

                            <strong class="house-rules-h7">A játszma vége</strong>
                            <ul class="house-rules-list">
                                <li><strong>Matt</strong> — a sakkban lévő király nem tud menekülni → vereség.</li>
                                <li><strong>Patt</strong> — nincs törvényes lépés, de a király nincs sakkban → döntetlen.</li>
                                <li><strong>50 lépéses szabály</strong> — 50 lépésen át nincs ütés és nincs gyalogmozgás → bármelyik fél döntetlent kérhet.</li>
                                <li><strong>Hármas állásismétlés</strong> — ugyanaz az állás 3-szor előfordul, ugyanazon a soron → döntetlen.</li>
                                <li><strong>Idő</strong> — ha lejár az időd, vereség; kivéve ha az ellenfélnek nincs mattoló anyaga (akkor döntetlen).</li>
                                <li><strong>Feladás</strong> — bármelyik játékos feladhat; ezzel az ellenfél nyer.</li>
                            </ul>

                            <strong class="house-rules-h7">Időkontroll fajták (ELO külön számolva)</strong>
                            <ul class="house-rules-list">
                                <li><strong>Klasszikus</strong> — hosszú idő (15+ perc).</li>
                                <li><strong>MattMester</strong> — saját, közepes tempó.</li>
                                <li><strong>Blitz</strong> — gyors (3–10 perc).</li>
                                <li><strong>Bullet</strong> — villámsakk (≤2 perc).</li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-conduct" class="house-rules-section">
                            <h6 class="house-rules-h6">2. Házirend</h6>
                            <p class="text-secondary small mb-3">
                                A MattMester közösségében minden játékos elvárhatja a tiszteletteljes hangnemet és a fair play-t.
                                A szabályok <strong>mindenkire</strong> vonatkoznak — a sima felhasználókra és az adminisztrátorokra is.
                            </p>

                            <div class="house-rules-callout house-rules-callout--danger">
                                <strong>Trágárság, sértő nyelvhasználat &mdash; 3 csapás rendszer (automatikus):</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li><strong>1. csapás</strong>: <span class="text-warning">automatikus 1 napos tiltás</span></li>
                                    <li><strong>2. csapás</strong>: <span class="text-warning">automatikus 10 napos tiltás</span></li>
                                    <li><strong>3. csapás</strong>: <span class="text-danger">automatikus végleges (perma) tiltás</span></li>
                                </ul>
                                <small class="d-block mt-2 text-secondary">
                                    Egy &quot;csapás&quot; akkor keletkezik, ha (a) a profanity-filter automatikusan maszkolja az üzenetedet, vagy (b) az admin a panelről töröl egy bejelentett üzenetedet. Az adminok nem élhetnek vissza a jogkörükkel.
                                </small>
                            </div>

                            <div class="house-rules-callout house-rules-callout--danger mt-3">
                                <strong>IP-ban (multi-account védelem) &mdash; automatikus eskaláció:</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li>Az első IP-blokk 1 napos. Visszaeső IP esetén perma IP-ban.</li>
                                    <li>Loopback (127.x, ::1) ki van hagyva — fejlesztői védelem.</li>
                                </ul>
                            </div>

                            <strong class="house-rules-h7 mt-3">Csalás és visszaélés</strong>
                            <ul class="house-rules-list">
                                <li><strong>Engine / külső segítség használata</strong> &mdash; perma ban.</li>
                                <li><strong>Sandbagging</strong> — szándékos vesztés ELO manipuláláshoz.</li>
                                <li><strong>Multi-account</strong> — több saját fiók egymással való &quot;játszása&quot;.</li>
                                <li><strong>Adminisztrátori jogkör abuzálása</strong> — super-admin felülvizsgálat.</li>
                            </ul>

                            <strong class="house-rules-h7">Üzenetek bejelentése</strong>
                            <ul class="house-rules-list">
                                <li>A chat-ben minden idegen üzenetbuborékon &quot;<span style="color:#ef4444;">&#9873;</span> Bejelentés&quot; gomb található.</li>
                                <li>Csak a beszélgetés résztvevője jelenthet, a saját üzenetét nem.</li>
                                <li>Ha a bejelentés irreleváns, 5 óráig nem küldhetsz újabbat.</li>
                            </ul>

                            <strong class="house-rules-h7">Spam védelem</strong>
                            <ul class="house-rules-list">
                                <li>Maximum <strong>5 chat üzenet / 10 másodperc</strong>.</li>
                                <li>Túllépés esetén az üzenet eldobódik.</li>
                            </ul>

                            <strong class="house-rules-h7">Ban &amp; fellebbezés</strong>
                            <ul class="house-rules-list">
                                <li>A tiltás során a fiók nem tud belépni, de a meccsadatok megmaradnak.</li>
                                <li>Hibás tiltás esetén ír: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a></li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-maintenance" class="house-rules-section">
                            <h6 class="house-rules-h6">3. Karbantartási mód</h6>
                            <p class="text-secondary small mb-3">
                                A platform időnként karbantartási módba kerül — szerver-frissítések, biztonsági javítások vagy adatbázis-migrációk futnak. Super-admin kapcsolja be a Beállítások oldalról.
                            </p>

                            <div class="house-rules-callout" style="background: rgba(255, 140, 26, 0.08); border-left-color: #ff8c1a;">
                                <strong style="color:#ffd9b3;">Mi történik karbantartás bekapcsolásakor?</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li><strong>30 perces ablak</strong> — figyelmeztető toast jelenik meg minden online usernek.</li>
                                    <li>Visszaszámláló: 30 perc → 15 perc → 5 perc → 1 perc múlva.</li>
                                    <li>Az ablak alatt minden funkció elérhető — érdemes a meccset befejezni.</li>
                                    <li>30 perc letelte után minden non-admin user a karbantartási oldalra kerül.</li>
                                    <li><strong>Adatvesztés nincs</strong>: a meccsek állása visszaállítható.</li>
                                </ul>
                            </div>

                            <strong class="house-rules-h7">A karbantartási oldal</strong>
                            <ul class="house-rules-list">
                                <li>Két gomb: <em>Oldal elhagyása</em> és <em>Újrapróbálkozás</em>.</li>
                                <li>30 mp-enként pingel — kikapcsoláskor visszairányít.</li>
                                <li>Support email: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a></li>
                            </ul>

                            <strong class="house-rules-h7">Adminok és karbantartás</strong>
                            <ul class="house-rules-list">
                                <li>A karbantartási mód <strong>nem érinti az adminokat</strong>.</li>
                                <li>Regisztráció külön kapcsolható a Beállítások oldalon.</li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-tips" class="house-rules-section">
                            <h6 class="house-rules-h6">4. Hasznos tudnivalók</h6>

                            <strong class="house-rules-h7">ELO rendszer</strong>
                            <ul class="house-rules-list">
                                <li>4 különálló rating: <em>Klasszikus, MattMester, Blitz, Bullet</em>. Új mode-on 800-tól vagy a meglévő ELO-dról indulsz.</li>
                            </ul>

                            <strong class="house-rules-h7">Profilkép moderálás</strong>
                            <ul class="house-rules-list">
                                <li>Új feltöltés &quot;<strong>függő</strong>&quot; státuszba kerül — csak te látod.</li>
                                <li>Admin <em>Jóváhagyja</em> vagy <em>Elutasítja</em> — real-time frissül.</li>
                            </ul>

                            <strong class="house-rules-h7">Email verifikáció</strong>
                            <ul class="house-rules-list">
                                <li>Bizonyos funkciók (pl. privát chat) megerősített email-t igényelnek.</li>
                            </ul>

                            <strong class="house-rules-h7">Barát rendszer és chat</strong>
                            <ul class="house-rules-list">
                                <li>Privát chat csak elfogadott barátokkal.</li>
                                <li>Tiltáskor a beszélgetés törlődik.</li>
                            </ul>

                            <strong class="house-rules-h7">Profil törlés &mdash; 24 órás grace</strong>
                            <ul class="house-rules-list">
                                <li>Admin törlés 24 órán belül visszavonható (soft-delete).</li>
                                <li>A meccsadatok megmaradnak ellenfeleknél.</li>
                            </ul>

                            <strong class="house-rules-h7">Chat tartalmi szűrő</strong>
                            <ul class="house-rules-list">
                                <li>Tiltott szót tartalmazó üzenet maszkolva (***) jelenik meg.</li>
                                <li>Az adminok új tiltott szavakat vehetnek fel a moderálási panelen.</li>
                            </ul>

                            <strong class="house-rules-h7">Értesítések</strong>
                            <ul class="house-rules-list">
                                <li>Felső sávban a harang ikon: barátkérés, üzenet, admin közlemény.</li>
                                <li>Real-time profilmódosítás-frissítés.</li>
                            </ul>

                            <strong class="house-rules-h7">Súgó / kapcsolat</strong>
                            <p class="mb-0">
                                Bármilyen kérdés, panasz, hiba bejelentés:
                                <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a>
                            </p>
                        </section>
                    </div>
                    <div class="modal-footer">
                        <small class="text-secondary me-auto">Verzió: 2026 &middot; A szabályzat módosításának jogát fenntartjuk.</small>
                        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Bezárás</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function buildModalMarkupEn() {
        return `
        <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-labelledby="${MODAL_ID}Label" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg modal-fullscreen-sm-down">
                <div class="modal-content house-rules-modal">
                    <div class="modal-header">
                        <h5 class="modal-title d-flex align-items-center gap-2" id="${MODAL_ID}Label">
                            <span class="house-rules-modal-icon" aria-hidden="true">&#9812;</span>
                            Rules and information
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body house-rules-modal-body">
                        <nav class="house-rules-toc" aria-label="Table of contents">
                            <a href="#hr-chess">1. Chess rules</a>
                            <a href="#hr-conduct">2. Code of conduct</a>
                            <a href="#hr-maintenance">3. Maintenance</a>
                            <a href="#hr-tips">4. Useful info</a>
                        </nav>

                        <section id="hr-chess" class="house-rules-section">
                            <h6 class="house-rules-h6">1. Chess rules</h6>
                            <p class="text-secondary small mb-3">
                                The goal: checkmate the opponent's king. Two players take turns on an 8&times;8 board.
                                A player who cannot make a legal move that keeps their king out of check, or whose king is checkmated, loses.
                            </p>

                            <strong class="house-rules-h7">Pieces and their movement</strong>
                            <ul class="house-rules-list">
                                <li><strong>King</strong> — one square in any direction (cannot move into check).</li>
                                <li><strong>Queen</strong> — any distance horizontally, vertically or diagonally.</li>
                                <li><strong>Rook</strong> — any distance horizontally or vertically.</li>
                                <li><strong>Bishop</strong> — any distance diagonally.</li>
                                <li><strong>Knight</strong> — &quot;L&quot; shape (2+1), can jump over other pieces.</li>
                                <li><strong>Pawn</strong> — one square forward (or two on first move), captures diagonally; promotes on the last rank.</li>
                            </ul>

                            <strong class="house-rules-h7">Special rules</strong>
                            <ul class="house-rules-list">
                                <li><strong>Castling</strong> — king + rook in one move if neither has moved, the king is not in check, and does not pass through an attacked square.</li>
                                <li><strong>En passant</strong> — capture a pawn that just made a 2-square move as if it had only moved one.</li>
                                <li><strong>Promotion</strong> — a pawn reaching the 8th rank promotes to queen, rook, bishop or knight (player's choice).</li>
                                <li><strong>Check</strong> — when the king is under attack; must be blocked or moved.</li>
                            </ul>

                            <strong class="house-rules-h7">End of the game</strong>
                            <ul class="house-rules-list">
                                <li><strong>Checkmate</strong> — king in check with no escape → loss.</li>
                                <li><strong>Stalemate</strong> — no legal move but king not in check → draw.</li>
                                <li><strong>50-move rule</strong> — 50 moves with no capture or pawn move → either side may claim a draw.</li>
                                <li><strong>Threefold repetition</strong> — same position appears 3 times on the same side to move → draw.</li>
                                <li><strong>Time</strong> — running out of time loses, unless the opponent has no mating material (then draw).</li>
                                <li><strong>Resignation</strong> — either player may resign; the opponent wins.</li>
                            </ul>

                            <strong class="house-rules-h7">Time controls (separate ELO each)</strong>
                            <ul class="house-rules-list">
                                <li><strong>Classical</strong> — long time (15+ minutes).</li>
                                <li><strong>MattMester</strong> — own, medium pace.</li>
                                <li><strong>Blitz</strong> — fast (3–10 minutes).</li>
                                <li><strong>Bullet</strong> — lightning chess (≤2 minutes).</li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-conduct" class="house-rules-section">
                            <h6 class="house-rules-h6">2. Code of conduct</h6>
                            <p class="text-secondary small mb-3">
                                In the MattMester community every player can expect respectful tone and fair play.
                                The rules apply to <strong>everyone</strong> — regular users and administrators alike.
                            </p>

                            <div class="house-rules-callout house-rules-callout--danger">
                                <strong>Profanity, offensive language &mdash; 3 strike system (automatic):</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li><strong>1st strike</strong>: <span class="text-warning">automatic 1-day ban</span></li>
                                    <li><strong>2nd strike</strong>: <span class="text-warning">automatic 10-day ban</span></li>
                                    <li><strong>3rd strike</strong>: <span class="text-danger">automatic permanent ban</span></li>
                                </ul>
                                <small class="d-block mt-2 text-secondary">
                                    A &quot;strike&quot; is recorded if (a) the profanity filter automatically masks your message, or (b) an admin deletes a reported message of yours. Admins cannot abuse their privileges.
                                </small>
                            </div>

                            <div class="house-rules-callout house-rules-callout--danger mt-3">
                                <strong>IP ban (multi-account protection) &mdash; automatic escalation:</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li>First IP block is 1 day. Repeat offender IP gets a permanent IP ban.</li>
                                    <li>Loopback (127.x, ::1) is excluded — developer protection.</li>
                                </ul>
                            </div>

                            <strong class="house-rules-h7 mt-3">Cheating and abuse</strong>
                            <ul class="house-rules-list">
                                <li><strong>Engine / external help</strong> &mdash; permanent ban.</li>
                                <li><strong>Sandbagging</strong> — intentional losing to manipulate ELO.</li>
                                <li><strong>Multi-accounting</strong> — playing your own accounts against each other.</li>
                                <li><strong>Admin power abuse</strong> — super-admin review.</li>
                            </ul>

                            <strong class="house-rules-h7">Reporting messages</strong>
                            <ul class="house-rules-list">
                                <li>In chat each foreign message has a &quot;<span style="color:#ef4444;">&#9873;</span> Report&quot; button.</li>
                                <li>Only conversation participants may report; you cannot report your own message.</li>
                                <li>If a report is irrelevant, you cannot send another for 5 hours.</li>
                            </ul>

                            <strong class="house-rules-h7">Spam protection</strong>
                            <ul class="house-rules-list">
                                <li>Maximum <strong>5 chat messages / 10 seconds</strong>.</li>
                                <li>Excess messages are dropped.</li>
                            </ul>

                            <strong class="house-rules-h7">Ban &amp; appeal</strong>
                            <ul class="house-rules-list">
                                <li>A banned account cannot sign in, but match data is preserved.</li>
                                <li>For wrongful bans, contact: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a></li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-maintenance" class="house-rules-section">
                            <h6 class="house-rules-h6">3. Maintenance mode</h6>
                            <p class="text-secondary small mb-3">
                                The platform occasionally enters maintenance mode for server updates, security fixes or database migrations. A super-admin enables it from the Settings page.
                            </p>

                            <div class="house-rules-callout" style="background: rgba(255, 140, 26, 0.08); border-left-color: #ff8c1a;">
                                <strong style="color:#ffd9b3;">What happens when maintenance starts?</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li><strong>30-minute window</strong> — a warning toast appears for every online user.</li>
                                    <li>Countdown: 30 min → 15 min → 5 min → 1 min remaining.</li>
                                    <li>All features remain available during the window — finish your match.</li>
                                    <li>After 30 minutes every non-admin user is redirected to the maintenance page.</li>
                                    <li><strong>No data loss</strong>: match state is restored after maintenance.</li>
                                </ul>
                            </div>

                            <strong class="house-rules-h7">The maintenance page</strong>
                            <ul class="house-rules-list">
                                <li>Two buttons: <em>Leave site</em> and <em>Retry</em>.</li>
                                <li>Pings every 30s — auto-redirects when maintenance ends.</li>
                                <li>Support email: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a></li>
                            </ul>

                            <strong class="house-rules-h7">Admins and maintenance</strong>
                            <ul class="house-rules-list">
                                <li>Maintenance mode <strong>does not affect admins</strong>.</li>
                                <li>Registration can be toggled separately on the Settings page.</li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-tips" class="house-rules-section">
                            <h6 class="house-rules-h6">4. Useful info</h6>

                            <strong class="house-rules-h7">ELO system</strong>
                            <ul class="house-rules-list">
                                <li>4 separate ratings: <em>Classical, MattMester, Blitz, Bullet</em>. New modes start at 800 or your existing ELO.</li>
                            </ul>

                            <strong class="house-rules-h7">Profile picture moderation</strong>
                            <ul class="house-rules-list">
                                <li>New uploads are <strong>pending</strong> — only you see them.</li>
                                <li>Admin <em>Approves</em> or <em>Rejects</em> — updates in real time.</li>
                            </ul>

                            <strong class="house-rules-h7">Email verification</strong>
                            <ul class="house-rules-list">
                                <li>Some features (e.g. private chat) require a verified email.</li>
                            </ul>

                            <strong class="house-rules-h7">Friend system and chat</strong>
                            <ul class="house-rules-list">
                                <li>Private chat only with accepted friends.</li>
                                <li>On block, the conversation is deleted.</li>
                            </ul>

                            <strong class="house-rules-h7">Profile deletion &mdash; 24-hour grace</strong>
                            <ul class="house-rules-list">
                                <li>Admin-initiated deletion is reversible within 24 hours (soft-delete).</li>
                                <li>Match data is preserved for opponents.</li>
                            </ul>

                            <strong class="house-rules-h7">Chat content filter</strong>
                            <ul class="house-rules-list">
                                <li>Messages with blocked words appear masked (***).</li>
                                <li>Admins can add new blocked words from the moderation panel.</li>
                            </ul>

                            <strong class="house-rules-h7">Notifications</strong>
                            <ul class="house-rules-list">
                                <li>Bell icon in the top bar: friend requests, messages, admin notices.</li>
                                <li>Real-time profile-edit refresh.</li>
                            </ul>

                            <strong class="house-rules-h7">Help / contact</strong>
                            <p class="mb-0">
                                Any questions, complaints, bug reports:
                                <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a>
                            </p>
                        </section>
                    </div>
                    <div class="modal-footer">
                        <small class="text-secondary me-auto">Version: 2026 &middot; We reserve the right to amend the rules.</small>
                        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function buildStyle() {
        return `
        <style id="${MODAL_ID}Styles">
            #${MODAL_ID} .house-rules-modal {
                background: #0f172a;
                color: #e2e8f0;
                border: 1px solid #1e293b;
            }
            #${MODAL_ID} .modal-header,
            #${MODAL_ID} .modal-footer {
                border-color: #1e293b;
            }
            #${MODAL_ID} .house-rules-modal-icon {
                color: #d4af37;
                font-size: 1.4rem;
            }
            #${MODAL_ID} .house-rules-modal-body {
                padding: 1.25rem 1.5rem;
                line-height: 1.55;
            }
            #${MODAL_ID} .house-rules-toc {
                display: flex;
                flex-wrap: wrap;
                gap: 6px 12px;
                margin-bottom: 1rem;
                padding-bottom: 0.75rem;
                border-bottom: 1px solid #1e293b;
                font-size: 13px;
            }
            #${MODAL_ID} .house-rules-toc a {
                color: #d4af37;
                text-decoration: none;
                padding: 4px 10px;
                border: 1px solid rgba(212, 175, 55, 0.35);
                border-radius: 999px;
                transition: background 0.15s ease;
            }
            #${MODAL_ID} .house-rules-toc a:hover {
                background: rgba(212, 175, 55, 0.12);
            }
            #${MODAL_ID} .house-rules-section {
                scroll-margin-top: 80px;
            }
            #${MODAL_ID} .house-rules-section + .house-rules-section {
                margin-top: 0.5rem;
            }
            #${MODAL_ID} .house-rules-h6 {
                color: #d4af37;
                font-weight: 700;
                font-size: 1.05rem;
                letter-spacing: 0.02em;
                margin-bottom: 0.5rem;
            }
            #${MODAL_ID} .house-rules-h7 {
                display: block;
                color: #f1f5f9;
                font-weight: 600;
                font-size: 0.95rem;
                margin-top: 0.85rem;
                margin-bottom: 0.35rem;
            }
            #${MODAL_ID} .house-rules-list {
                margin: 0.25rem 0 0.6rem 0.25rem;
                padding-left: 1.25rem;
                color: #cbd5e1;
                font-size: 0.92rem;
            }
            #${MODAL_ID} .house-rules-list li {
                margin-bottom: 0.25rem;
            }
            #${MODAL_ID} .house-rules-list li strong {
                color: #f8fafc;
            }
            #${MODAL_ID} .house-rules-divider {
                border: 0;
                border-top: 1px solid #1e293b;
                margin: 1.5rem 0;
            }
            #${MODAL_ID} .house-rules-callout {
                margin: 0.75rem 0;
                padding: 0.85rem 1rem;
                border-radius: 10px;
                background: rgba(239, 68, 68, 0.08);
                border-left: 4px solid #ef4444;
            }
            #${MODAL_ID} .house-rules-callout--danger strong {
                color: #fecaca;
            }
            #${MODAL_ID} a {
                color: #d4af37;
            }
            .house-rules-footer-link {
                background: transparent;
                border: 1px solid rgba(212, 175, 55, 0.45);
                color: #d4af37;
                padding: 4px 12px;
                border-radius: 999px;
                font-size: 12px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                line-height: 1.4;
                text-decoration: none;
            }
            .house-rules-footer-link:hover {
                background: rgba(212, 175, 55, 0.12);
                color: #fde68a;
            }
        </style>
        `;
    }

    function inject() {
        if (typeof document === 'undefined' || !document.body) return;
        const lang = getCurrentLang();

        // Ha mar injektaltunk de mas nyelven, le kell csereljuk a markup-ot.
        const existing = document.getElementById(MODAL_ID);
        if (existing && injectedLang === lang) {
            injected = true;
            return;
        }
        if (existing) {
            // Lecsereljuk a wrappert
            const oldWrap = document.getElementById(`${MODAL_ID}Wrapper`);
            if (oldWrap && oldWrap.parentNode) {
                oldWrap.parentNode.removeChild(oldWrap);
            } else if (existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }
        }

        const styleHost = document.createElement('div');
        styleHost.innerHTML = buildStyle();
        const styleEl = styleHost.firstElementChild;
        if (styleEl && !document.getElementById(`${MODAL_ID}Styles`)) {
            document.head.appendChild(styleEl);
        }

        const wrapper = document.createElement('div');
        wrapper.id = `${MODAL_ID}Wrapper`;
        wrapper.innerHTML = buildModalMarkup(lang);
        document.body.appendChild(wrapper);

        injected = true;
        injectedLang = lang;
    }

    function open() {
        inject();
        const el = document.getElementById(MODAL_ID);
        if (!el) return false;
        if (typeof globalScope.bootstrap === 'undefined') {
            console.warn('[houseRules] Bootstrap JS nem érhető el — modal nem nyitható meg.');
            return false;
        }
        const modal = globalScope.bootstrap.Modal.getOrCreateInstance(el);
        modal.show();
        return true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject, { once: true });
    } else {
        inject();
    }

    // Lang-valtaskor ujra-injektaljuk a modalt (ha mar nyitva volt).
    try {
        globalScope.addEventListener('mm:lang-changed', () => {
            const wasOpen = !!document.querySelector(`#${MODAL_ID}.show`);
            inject();
            if (wasOpen && globalScope.bootstrap?.Modal) {
                const el = document.getElementById(MODAL_ID);
                if (el) {
                    const m = globalScope.bootstrap.Modal.getOrCreateInstance(el);
                    m.show();
                }
            }
        });
    } catch (_) { /* ignore */ }

    globalScope.MattMesterHouseRules = { open, inject };
})(window);
