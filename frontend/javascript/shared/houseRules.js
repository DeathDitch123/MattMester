/**
 * MattMesterHouseRules — közös "Szabályok és tudnivalók" modal.
 *
 * Auto-injektálódik minden oldalra ahol be van linkelve. Görgethető Bootstrap modal-t
 * regisztrál a body alá, és exponálja a window.MattMesterHouseRules.open() API-t.
 *
 * Használat (HTML):
 *   <button onclick="MattMesterHouseRules.open()">Szabályok</button>
 *  vagy
 *   <button data-bs-toggle="modal" data-bs-target="#houseRulesModal">Szabályok</button>
 */
(function initHouseRules(globalScope) {
    'use strict';

    const MODAL_ID = 'houseRulesModal';
    let injected = false;

    function buildModalMarkup() {
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
                            <a href="#hr-tips">3. Hasznos tudnivalók</a>
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
                                A szabályok <strong>mindenkire</strong> vonatkoznak — a sima felhasználókra és az adminisztrátorokra is. Az adminok nem élhetnek vissza a jogkörükkel.
                            </p>

                            <div class="house-rules-callout house-rules-callout--danger">
                                <strong>Trágárság, sértő nyelvhasználat &mdash; 3 csapás rendszer (automatikus):</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li><strong>1. csapás</strong>: <span class="text-warning">automatikus 1 napos tiltás</span></li>
                                    <li><strong>2. csapás</strong>: <span class="text-warning">automatikus 10 napos tiltás</span></li>
                                    <li><strong>3. csapás</strong>: <span class="text-danger">automatikus végleges (perma) tiltás</span></li>
                                </ul>
                                <small class="d-block mt-2 text-secondary">
                                    Egy &quot;csapás&quot; akkor keletkezik, ha (a) a profanity-filter automatikusan maszkolja az üzenetedet — a tiltott szó a hardcoded vagy a dinamikusan bővített blocklist-ben szerepel, vagy (b) az admin a panelről töröl egy bejelentett üzenetedet. A csapásokat a rendszer felhasználónként számolja, és a megfelelő tiltást automatikusan alkalmazza.
                                </small>
                                <small class="d-block mt-2 text-secondary">
                                    <strong>Az adminokra is vonatkozik!</strong> Az automatikus rendszer nem ismer szerepkört — mindenki ugyanazokat a csapásokat kapja, az adminok sem élhetnek vissza a jogkörükkel.
                                </small>
                            </div>

                            <div class="house-rules-callout house-rules-callout--danger mt-3">
                                <strong>IP-ban (multi-account védelem) &mdash; automatikus eskaláció:</strong>
                                <ul class="house-rules-list mb-0 mt-2">
                                    <li>Minden account-tiltás (auto vagy admin által) az adott felhasználó utolsó ismert IP-jével együtt naplózódik.</li>
                                    <li>Ha <strong>ugyanarról az IP címről</strong> egy <strong>másik felhasználó</strong> is olyan szabálysértést követ el, ami account-tiltást vált ki, akkor az IP-cím is automatikusan blokkolásra kerül:
                                        <ul class="mt-1">
                                            <li><strong>Első IP-ban</strong>: <span class="text-warning">1 napos IP-tiltás</span> &mdash; soha nem perma elsőre.</li>
                                            <li><strong>Visszaeső IP</strong> (ha az IP-nek már volt korábbi IP-blokk-története): <span class="text-danger">végleges (perma) IP-tiltás</span>.</li>
                                        </ul>
                                    </li>
                                </ul>
                                <small class="d-block mt-2 text-secondary">
                                    Tipikus eset: az &quot;A&quot; fiókot trágárságért bannolják, a felhasználó új fiókot (&quot;B&quot;) készít ugyanarról az IP-ről, és azzal is súlyos szabálysértést követ el → a rendszer automatikusan IP-tiltást is kioszt. Ha ez ismétlődik (= ugyanaz az IP újra trigger-elne), perma IP-ban.
                                </small>
                                <small class="d-block mt-2 text-secondary">
                                    Az IP-ban a kapcsolódó hardver/hálózat <strong>minden</strong> jövőbeni fiók-létrehozást és belépést blokkol az adott IP-ről, függetlenül attól, hogy korábban ott milyen fiók működött.
                                </small>
                            </div>

                            <strong class="house-rules-h7 mt-3">Csalás és visszaélés &mdash; admin által kézzel kiszabott szankciók</strong>
                            <ul class="house-rules-list">
                                <li><strong>Engine / külső segítség használata</strong> a játszmák során &mdash; perma ban.</li>
                                <li><strong>Sandbagging</strong> — szándékos vesztés ELO manipuláláshoz.</li>
                                <li><strong>Multi-account</strong> — több saját fiók egymással való &quot;játszása&quot;. Az admin panel IP egyezés-vizsgálattal segíti a felderítést.</li>
                                <li><strong>Adminisztrátori jogkör abuzálása</strong> — indokolatlan ban, magánbeszélgetésbe avatkozás stb.: super-admin felülvizsgálat, jogkör visszavonása.</li>
                            </ul>
                            <small class="d-block text-secondary">Ezek nem automatikusak — admin kézzel bírál és tilt, az indok minden esetben naplózásra kerül (audit log, severity: critical).</small>

                            <strong class="house-rules-h7">Üzenetek bejelentése</strong>
                            <ul class="house-rules-list">
                                <li>A chat-ben minden idegen üzenetbuborékon kis &quot;<span style="color:#ef4444;">&#9873;</span> Bejelentés&quot; gomb található (hover-on jelenik meg).</li>
                                <li>Csak a beszélgetés résztvevője jelenthet, és a saját üzenetét nem.</li>
                                <li>Ha a bejelentés nem releváns (admin elutasítja), <strong>5 óráig</strong> nem küldhetsz újabbat. Ismétlődő rosszhiszemű bejelentésnél hosszabb tiltás következhet.</li>
                            </ul>

                            <strong class="house-rules-h7">Spam védelem</strong>
                            <ul class="house-rules-list">
                                <li>Maximum <strong>5 chat üzenet / 10 másodperc</strong>.</li>
                                <li>Túllépés esetén az üzenet eldobódik, ismétlődés esetén ban.</li>
                            </ul>

                            <strong class="house-rules-h7">Ban &amp; fellebbezés</strong>
                            <ul class="house-rules-list">
                                <li>A tiltás során a fiók nem tud belépni, de a meccsadatok megmaradnak.</li>
                                <li>Hibásnak vélt tiltás esetén ír a támogatásra: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=mattmester.support@gmail.com" target="_blank" rel="noopener">mattmester.support@gmail.com</a></li>
                            </ul>
                        </section>

                        <hr class="house-rules-divider">

                        <section id="hr-tips" class="house-rules-section">
                            <h6 class="house-rules-h6">3. Hasznos tudnivalók (rejtett tippek)</h6>

                            <strong class="house-rules-h7">ELO rendszer</strong>
                            <ul class="house-rules-list">
                                <li>4 különálló rating: <em>Klasszikus, MattMester, Blitz, Bullet</em>. Az új mode-okon is 800-tól vagy a meglévő ELO-dról indulsz, így nem veszíted el a régi haladásod.</li>
                            </ul>

                            <strong class="house-rules-h7">Profilkép moderálás</strong>
                            <ul class="house-rules-list">
                                <li>Új feltöltés előbb &quot;<strong>függő</strong>&quot; státuszba kerül — csak te látod, mások az alapértelmezettet.</li>
                                <li>Az admin <em>Jóváhagyás</em> gombra ráüt → globálisan látható, vagy <em>Elutasítás</em> → automatikusan vissza az alapértelmezettre.</li>
                                <li>A státuszváltozás real-time frissül a profil oldalon.</li>
                            </ul>

                            <strong class="house-rules-h7">Email verifikáció</strong>
                            <ul class="house-rules-list">
                                <li>Bizonyos funkciók (pl. privát beszélgetés indítása, ELO ranglista) megerősített email-t igényelnek. A beállítások oldalról küldhetsz újra megerősítő linket.</li>
                            </ul>

                            <strong class="house-rules-h7">Barát rendszer és chat</strong>
                            <ul class="house-rules-list">
                                <li>Privát chat <strong>csak elfogadott barátokkal</strong> nyitható.</li>
                                <li>Tiltás után a beszélgetés automatikusan törlődik (mindkét fél).</li>
                                <li>A nem barát csak a publikus profilodat látja.</li>
                            </ul>

                            <strong class="house-rules-h7">Profil törlés &mdash; 24 órás grace</strong>
                            <ul class="house-rules-list">
                                <li>Admin által indított törlés <strong>24 órán belül</strong> visszavonható (soft-delete). Utána a fiók véglegesen törlődik.</li>
                                <li>A meccsadatok megmaradnak az ellenfeleidnél, de a felhasználóneved <em>&quot;Törölt felhasználó&quot;</em>-ra cserélődik.</li>
                            </ul>

                            <strong class="house-rules-h7">Chat tartalmi szűrő (soft-mask)</strong>
                            <ul class="house-rules-list">
                                <li>Tiltott szót tartalmazó üzenet eljut a szerverre, de <strong>maszkolva</strong> (***) jelenik meg a többi résztvevőnél. Te látod a saját üzeneted.</li>
                                <li>A admin moderálási panelen ezek &quot;Auto-flagged&quot; sorként jelennek meg, így a szabálysértők bannolhatók.</li>
                                <li>A tiltott szavak listája <strong>dinamikus</strong>: az adminok új szavakat adhatnak hozzá az &quot;Tiltott szavakhoz&quot; gombbal a moderálási panelen.</li>
                            </ul>

                            <strong class="house-rules-h7">Értesítések</strong>
                            <ul class="house-rules-list">
                                <li>A felső sávban a &quot;harang&quot; ikon mutatja a kéretlen értesítéseket: barátkérés, üzenet, admin közlemény stb.</li>
                                <li>Admin által végrehajtott profilmódosítás real-time frissíti a profil oldaladat.</li>
                            </ul>

                            <strong class="house-rules-h7">IP-tiltás működése</strong>
                            <ul class="house-rules-list">
                                <li>Az IP-tiltás <strong>nem azonnali</strong> egyetlen szabálysértésnél &mdash; legalább két <strong>különböző fiók</strong> kell, hogy legyen ugyanarról az IP-ről banolva.</li>
                                <li>Az első IP-tiltás mindig <strong>csak 1 nap</strong>; ezzel a rendszer védi a megosztott IP-ket (pl. családi háztartás, kollégium, kávézó) a túl szigorú elsőre-perma-banolástól.</li>
                                <li>Visszaeső IP-nél (= már volt korábban IP-blokk-rekord rajta) az új trigger automatikusan <strong>perma IP-ban</strong>.</li>
                                <li>A loopback címek (127.x, ::1) ki vannak hagyva &mdash; fejlesztői és lokális környezet védelme.</li>
                                <li>Az admin a Riasztások panelről kézzel is feloldhat / újra-blokkolhat IP címet.</li>
                            </ul>

                            <strong class="house-rules-h7">Adatvédelem</strong>
                            <ul class="house-rules-list">
                                <li>A jelszavak bcrypt-tel, a session-tokenek SHA-256-tal hashelve tárolódnak — sem a jelszó, sem a teljes token nem kerül naplóba (audit log redaction allowlist).</li>
                                <li>IP címek a biztonsági audit log-ban szerepelnek (a retention 18 hónap, kizárólag visszaélés-vizsgálati céllal hozzáférhető admin szerepkörrel).</li>
                                <li>Az admin step-up token TTL: 15 perc sliding (utolsó használattól számolva), a session-cookie ettől független.</li>
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
            /* Footer button — opcionalis stilizalas, hogy a meglevo footer-rel jol nezzen ki. */
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
        if (injected) return;
        if (typeof document === 'undefined' || !document.body) return;
        if (document.getElementById(MODAL_ID)) {
            injected = true;
            return;
        }

        const styleHost = document.createElement('div');
        styleHost.innerHTML = buildStyle();
        const styleEl = styleHost.firstElementChild;
        if (styleEl && !document.getElementById(`${MODAL_ID}Styles`)) {
            document.head.appendChild(styleEl);
        }

        const wrapper = document.createElement('div');
        wrapper.id = `${MODAL_ID}Wrapper`;
        wrapper.innerHTML = buildModalMarkup();
        document.body.appendChild(wrapper);

        injected = true;
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

    globalScope.MattMesterHouseRules = { open, inject };
})(typeof window !== 'undefined' ? window : this);
