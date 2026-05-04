/* =============================================================
   MattMester I18N — ket-nyelvu (HU/EN) szoveg-rendszer
   =============================================================
   Hasznalat:
     - HTML-ben: <span data-i18n="key">Magyar default</span>
     - Attribut: data-i18n-attr="placeholder:auth.username_ph"
     - JS-bol: MattMesterI18n.t('key')
     - Nyelvvaltas: MattMesterI18n.set('en');
     - HTML class-on attributumon: data-i18n-html="key" -> innerHTML
   ============================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'mattmester.lang';
    const DEFAULT_LANG = 'hu';
    const SUPPORTED = ['hu', 'en'];

    const DICT = {
        hu: {
            // ── Felso navbar / kozos ──
            'nav.greeting':         'Szia',
            'nav.profile_settings': 'Profil beállítás',
            'nav.admin_panel':      'Admin felület',
            'nav.logout':           'Kijelentkezés',

            'common.cancel':        'Mégse',
            'common.confirm':       'Megerősítés',
            'common.save':          'Mentés',
            'common.close':         'Bezárás',
            'common.send':          'Küldés',
            'common.loading':       'Betöltés...',
            'common.yes':           'Igen',
            'common.no':            'Nem',
            'common.error':         'Hiba',
            'common.success':       'Siker',
            'common.back':          'Vissza',
            'common.next':          'Tovább',
            'common.delete':        'Törlés',
            'common.edit':          'Szerkesztés',
            'common.search':        'Keresés',
            'common.filter':        'Szűrés',
            'common.actions':       'Műveletek',
            'common.username':      'Felhasználónév',
            'common.email':         'Email',
            'common.password':      'Jelszó',
            'common.done':          'Kész',
            'common.reason':        'Indok',

            // ── Index oldal ──
            'index.live_chess_platform': 'Élő közösségi sakk platform',
            'index.hero_title':     'Játssz, fejlődj, lépj a ranglétra élére',
            'index.hero_subtitle':  'Versenyezz Mattmester, Klasszikus vagy Gép elleni módban. Vendégként azonnal elkezdheted, fiókkal pedig követheted az ELO fejlődésedet',
            'index.play':           'Játék',
            'index.leaderboard':    'Ranglista',
            'index.login':          'Bejelentkezés',
            'index.register':       'Regisztráció',
            'index.classical':      'Klasszikus',
            'index.mattmester':     'MattMester',
            'index.bullet':         'Bullet',
            'index.winrate':        'WinRate',
            'index.elo':            'ELO',
            'index.win_ratio':      'Nyert játszmák aránya',
            'index.all_players':    'Összes játékos',
            'index.registered_accounts': 'regisztrált fiók',
            'index.online_players': 'Online játékosok',
            'index.now_active':     'most aktív',
            'index.live_games':     'Élő játszmák',
            'index.now_running':    'jelenleg fut',
            'index.all_games':      'Összes játszma',
            'index.played_with_us': 'Ennyiszer játszottak már velünk',
            'index.top_players':    'Top játékosok ELO szerint',
            'index.updated':        'Frissítve: ma',
            'index.sort_by':        'Rendezés:',
            'index.elo_mattmester': 'ELO MattMester',
            'index.elo_bullet':     'ELO Bullet',
            'index.limit':          'Limit:',
            'index.top10':          'Top 10',
            'index.top25':          'Top 25',
            'index.top100':         'Top 100',
            'index.rank':           '#',
            'index.player':         'Játékos',
            'index.last_seen':      'Utoljára itt járt',
            'index.user_since':     'Felhasználó ezóta',
            'index.no_results':     'Nincs találat a megadott szűrőkkel.',
            'index.modern_chess':   'Modern sakkélmény',
            'index.rules':          'Szabályok',

            // ── Login modal ──
            'login.title':          'Bejelentkezés',
            'login.username_label': 'Felhasználónév/Email:',
            'login.username_ph':    'Mattmester / mattmester@gmail.com',
            'login.password_label': 'Jelszó:',
            'login.password_ph':    'Jelszó',
            'login.remember_me':    'Emlékezz rám:',
            'login.forgot':         'Jelszó elfelejtve?',
            'login.submit':         'Bejelentkezés',

            // ── Forgot password ──
            'forgot.title':         'Jelszó visszaállítása',
            'forgot.heading':       'Új jelszó kérése',
            'forgot.note':          'Add meg a fiókod email címét, és küldünk egy visszaállító linket.',
            'forgot.email_label':   'Email cím',
            'forgot.email_ph':      'mattmester@gmail.com',
            'forgot.send':          'Email küldése',
            'forgot.back_login':    'Vissza a bejelentkezéshez',

            // ── Register modal ──
            'register.title':       'Regisztráció',
            'register.username_label':'Felhasználónév',
            'register.username_ph': 'Mattmester',
            'register.email_label': 'Email:',
            'register.email_ph':    'mattmester@gmail.com',
            'register.password_label':'Jelszó:',
            'register.password_ph': 'Jelszó',
            'register.submit':      'Regisztráció',

            'toast.done':           'Kész.',

            // ── Profile oldal ──
            'profile.title':        'Profil',
            'profile.dashboard':    'Áttekintés',
            'profile.stats':        'Statisztikák',
            'profile.history':      'Játéktörténet',
            'profile.friends':      'Barátok',
            'profile.settings':     'Beállítások',
            'profile.security':     'Biztonság',
            'profile.notifications':'Értesítések',
            'profile.messages':     'Üzenetek',
            'profile.logout_confirm':'Biztosan kijelentkezel?',
            'profile.profile_image':'Profilkép',
            'profile.change_image': 'Kép módosítása',
            'profile.account':      'Fiók',
            'profile.danger_zone':  'Veszélyes zóna',
            'profile.delete_account':'Fiók törlése',
            'profile.change_password':'Jelszó módosítása',
            'profile.recent_games': 'Legutóbbi játszmák',
            'profile.wins':         'Győzelmek',
            'profile.losses':       'Vereségek',
            'profile.draws':        'Döntetlenek',
            'profile.abilities_used':'Használt képességek',
            'profile.online':       'Online',
            'profile.offline':      'Offline',
            'profile.add_friend':   'Barát hozzáadása',
            'profile.no_friends':   'Még nincsenek barátaid.',
            'profile.no_history':   'Még nincs játszmád.',
            'profile.search_players':'Keresés játékosokra',
            'profile.search_players_ph':'Keresés játékosokra...',
            'profile.profile_image_status':'Profilkép státusz',
            'profile.recent_opponents':'Legutóbbi ellenfelek',
            'profile.recent_opponents_hint':'Max 25 · kattints rájuk',
            'profile.no_opponents': 'Még nem játszottál senkivel — indíts egy meccset!',
            'profile.ability_usage':'Képesség használat',
            'profile.friends_loading':'Barátok betöltése...',
            'profile.friend_all':   'Összes',
            'profile.friend_pending':'Függő',
            'profile.friend_friend':'Már barát',
            'profile.friend_blocked':'Blokkolt',
            'profile.account_status':'Fiók állapota',
            'profile.email_verification':'Email ellenőrzés',
            'profile.email_checking':'Ellenőrzés alatt',
            'profile.account_type': 'Fiók típus',
            'profile.player_role':  'Játékos',
            'profile.status':       'Állapot',
            'profile.active':       'Aktív',
            'profile.email_required':'Email megerősítés szükséges',
            'profile.email_required_hint':'Kattints az újraküldésre, ha nem kaptad meg a levelet.',
            'profile.resend_verification':'Verifikációs email újraküldése',
            'profile.resend_hint':  'Ha nem érkezik email, ellenőrizd a spam/promóciók mappát is.',
            'profile.member_since': 'Tag ezóta',
            'profile.security_activity':'Biztonság és aktivitás',
            'profile.filter_session':'Munkamenet',
            'profile.filter_security':'Biztonság',
            'profile.filter_profile':'Profil',
            'profile.filter_social':'Szociális',
            'profile.refresh':      'Frissítés',
            'profile.logout_all':   'Minden eszközről kijelentkezés',
            'profile.time':         'Időpont',
            'profile.event':        'Esemény',
            'profile.ip':           'IP cím',
            'profile.device':       'Eszköz / Böngésző',
            'profile.security_loading':'Biztonsági napló betöltése...',
            'profile.profile_settings':'Profil beállításai',
            'profile.upload_new':   'Új feltöltése',
            'profile.remove':       'Eltávolítás',
            'profile.image_approved':'Profilkép státusz: Jóváhagyott',
            'profile.email_address':'Email cím',
            'profile.new_password': 'Új jelszó',
            'profile.new_password_ph':'Hagyd üresen, ha nem változtatsz',
            'profile.confirm_password':'Új jelszó megerősítése',
            'profile.confirm_password_ph':'Új jelszó megerősítése',
            'profile.save_changes': 'Változások mentése',
            'profile.danger_zone_title':'Veszélyes zóna',
            'profile.delete_warning':'A profil törlése végleges és nem vonható vissza.',
            'profile.delete_profile':'Profil törlése',
            'profile.notif_title':  'Értesítések',
            'profile.no_notif':     'Nincs új értesítés.',
            'profile.mark_all_read':'Mind olvasott',
            'profile.quick_play':   'Gyors játék',
            'profile.logout_title': 'Kijelentkezés megerősítése',
            'profile.logout_q':     'Biztosan ki szeretnél jelentkezni?',
            'profile.logout_all_title':'Kijelentkezés minden eszközről',
            'profile.logout_all_q': 'Biztosan ki szeretnél jelentkezni minden eszközről?',
            'profile.logout_all_hint':'Az összes aktív munkameneted megszűnik, és ezen az eszközön is újra be kell jelentkezned.',
            'profile.logout_all_btn':'Kijelentkezés minden eszközről',
            'profile.add_friend_title':'Barát hozzáadása',
            'profile.friend_username_ph':'Pl.: ChessWizard88',
            'profile.send_request': 'Kérés küldése',
            'profile.search_results':'Keresési találatok',
            'profile.results_loading':'Találatok betöltése...',
            'profile.no_search_results':'Nincs találat a megadott keresésre.',
            'profile.player_profile':'Játékos profil',
            'profile.joined':       'Csatlakozott',
            'profile.last_active':  'Utoljára aktív',
            'profile.beginner':     'Kezdő',
            'profile.delete_perm':  'Ez a művelet véglegesen eltávolítja a profiladataidat ebből a munkamenetből.',
            'profile.delete_password_label':'A megerősítéshez add meg a jelszavad:',
            'profile.password_input_ph':'Jelszó megadása',
            'profile.delete_ack':   'Megértettem, hogy ez a folyamat nem vonható vissza.',
            'profile.delete_btn':   'Törlés',
            'profile.remove_avatar_title':'Profilkép eltávolítása',
            'profile.remove_avatar_q':'Biztosan visszaállítod a profilképet az alapértelmezett képre?',
            'profile.remove_avatar_btn':'Eltávolítás',
            'profile.image_crop':   'Profilkép kivágása',
            'profile.image_crop_hint':'A képet húzással mozgathatod, zoomolhatod és forgathatod.',
            'profile.zoom':         'Nagyítás',
            'profile.rotate':       'Forgatás',
            'profile.preview':      'Előnézet',
            'profile.reset':        'Visszaállítás',
            'profile.image_norm':   'A kép feleljen meg a társadalmi normáknak. (tilos: NSFW, Tiltott szimbólumok) a szabályzat abuzálása tilos és kitiltást vonhat maga után...',
            'profile.confirm_change':'Módosítás megerősítése',
            'profile.confirm_change_q':'Biztosan menteni szeretnéd az alábbi változásokat?',
            'profile.current_password':'Jelenlegi jelszó',
            'profile.current_password_ph':'A mentéshez add meg a jelenlegi jelszavad',
            'profile.confirm_hint': 'A mentés gomb 10 másodperc múlva lesz aktív.',
            'profile.top_nav_aria': 'Felső navigáció',
            'profile.sidebar_toggle_aria':'Oldalsáv ki/be',
            'profile.friends_filter_aria':'Barátok lista szűrése',
            'profile.friends_refresh_aria':'Barát lista frissítése',
            'profile.friends_add_aria':'Játékos keresése és barát hozzáadása',
            'profile.security_filter_aria':'Biztonsági napló szűrése',
            'profile.email_ph':     'email@példa.hu',
            'profile.player_alt':   'Játékos profilkép',

            // ── Chess mode chooser modal ──
            'cmc.new_match':        'Új meccs',
            'cmc.choose_mode':      'Válassz játékmódot',
            'cmc.vs_bot':           'Robot ellen',
            'cmc.vs_player':        'Játékos ellen',
            'cmc.back':             '← Vissza',
            'cmc.bot_difficulty':   'Robot nehézség',
            'cmc.casual_no_elo':    '(casual, ELO nem frissül)',
            'cmc.ranked':           'Rangsorolt',
            'cmc.ranked_hint':      'ELO frissül (csak időkorlátos módoknál)',
            'cmc.invite_friend':    'Barát meghívása',
            'cmc.random_opp':       'Random ellenfél',
            'cmc.choose_opp':       'Válassz ellenfelet',
            'cmc.searching_opp':    'Ellenfél keresése',
            'cmc.waiting':          'Várakozás',
            'cmc.for_response':     'válaszára',
            'cmc.cancel_invite':    'Meghívás visszavonása',
            'cmc.your_elo':         'A te ELO-d',

            // ── Admin Panel ──
            'admin.title':          'Admin Panel',
            'admin.dashboard':      'Vezérlőpult',
            'admin.users':          'Felhasználók',
            'admin.users_list':     'Lista',
            'admin.user_details':   'Részletek és szerkesztés',
            'admin.bans':           'Tiltások',
            'admin.user_delete':    'Felhasználó törlése',
            'admin.user_create':    'Új felhasználó',
            'admin.moderation':     'Moderáció',
            'admin.chat_moderation':'Chat moderálás',
            'admin.profile_images': 'Profilképek',
            'admin.reports':        'Bejelentések',
            'admin.gameplay':       'Játékok',
            'admin.games':          'Játszmák',
            'admin.abilities':      'Képességek',
            'admin.logs':           'Naplók',
            'admin.security_logs':  'Bejelentkezések',
            'admin.audit_log':      'Audit napló',
            'admin.alerts':         'Riasztások',
            'admin.super_admin':    'Super admin',
            'admin.friends':        'Közösségi kapcsolatok',
            'admin.tests':          'Tesztek',
            'admin.settings':       'Beállítások',
            'admin.full_logout':    'Teljes kijelentkezés',
            'admin.full_logout_msg':'Ez kijelentkeztet az admin felületről és a főoldalról is.',
            'admin.full_logout_hint':'Ha csak vissza szeretnél térni a főoldalra (bejelentkezve maradva), kattints helyette a fent baloldali MATTMESTER logóra.',
            'admin.search_placeholder':'Keresés...',
            'admin.no_data':        'Nincs adat',
            'admin.created_at':     'Létrehozva',
            'admin.last_active':    'Utolsó aktivitás',
            'admin.role':           'Szerep',
            'admin.status':         'Állapot',
            'admin.notif_title':    'Értesítések',
            'admin.no_notif':       'Nincs új értesítés.',
            'admin.alert_messages': 'Üzenet',
            'admin.send_message':   'Üzenet küldése',
            'admin.allow_message':  'Üzenet engedélyezése',
            'admin.add_blocklist':  'Tiltott szavak hozzáadása',
            'admin.blocklist_intro':'Ezután minden új chat üzenet, amely ezen szavak valamelyikét tartalmazza, automatikusan blokkolva lesz.',
            'admin.message_id':     'Üzenet azonosító',
            'admin.words':          'Szavak',
            'admin.add':            'Hozzáadás',
            'admin.allow':          'Engedélyezés',
            'admin.character_count':'karakter',
            'admin.token':          'Token',
            'admin.token_refresh':  'Admin token frissítése',
            'admin.token_title':    'Admin token érvényessége — kattints a frissítéshez',
            'admin.alerts_jump':    'Riasztások — ugrás a Riasztások oldalra',
            'admin.user_details_title':'Felhasználó részletei',
            'admin.profile_image':  'Profilkép',
            'admin.email_status':   'Email státusz',
            'admin.classical':      'Klasszikus',
            'admin.mattmester':     'MattMester',
            'admin.bullet':         'Bullet',
            'admin.win':            'Győzelem',
            'admin.loss':           'Vereség',
            'admin.draw':           'Döntetlen',
            'admin.win_rate':       'Győzelmi arány',
            'admin.last_active_label':'Utolsó aktivitás',
            'admin.joined':         'Csatlakozott',
            'admin.last_ip':        'Utolsó IP',
            'admin.what_happened':  'Vele történt',
            'admin.he_did':         'Ő végezte',
            'admin.security_log':   'Biztonsági napló',
            'admin.audit_last100':  'Audit napló — utolsó 100',
            'admin.loading_logs':   'Naplóbejegyzések betöltése…',
            'admin.switch_tab':     'Válts a fülre a betöltéshez.',
            'admin.filter_all':     'Összes',
            'admin.filter_session': 'Munkamenet',
            'admin.filter_security':'Biztonság',
            'admin.filter_profile': 'Profil',
            'admin.filter_social':  'Szociális',
            'admin.ban':            'Tiltás',
            'admin.edit':           'Szerkesztés',
            'admin.new_user':       'Új felhasználó',
            'admin.new_user_username_ph':'Add meg a felhasználónevet',
            'admin.new_user_email': 'E-mail',
            'admin.new_user_email_ph':'Add meg az e-mail címet',
            'admin.role_label':     'Szerepkör',
            'admin.role_player':    'Játékos',
            'admin.role_admin':     'Adminisztrátor',
            'admin.initial_elo':    'Kezdeti ELO',
            'admin.reason_audit':   'Indok (audit)',
            'admin.reason_audit_ph':'Pl.: Új csapat-tag onboarding (legalább 10 karakter)',
            'admin.reason_audit_hint':'Az indok az admin audit logba kerül.',
            'admin.create_user':    'Felhasználó létrehozása',
            'admin.elevate_title':  'Admin szint aktiválása',
            'admin.elevate_info':   'A session bejelentkezés mellett az admin műveletekhez szükséges egy 15 perc érvényességű step-up token. Add meg a saját jelszavadat a token kiállításához.',
            'admin.your_password':  'Saját jelszavad',
            'admin.exit':           'Kilépés',
            'admin.activate_15min': 'Aktiválás (15 perc)',
            'admin.critical_title': 'Kritikus művelet megerősítése',
            'admin.critical_warning':'Ez a művelet naplózásra kerül és nem visszavonható. A folytatáshoz add meg az indokot min. 10 karakterben és a saját jelszavadat.',
            'admin.reason_label':   'Indok',
            'admin.reason_ph':      'Naplózásra kerülő indok (min. 10 karakter)...',
            'admin.confirm_password':'Megerősítő jelszó',
            'admin.confirm_password_ph':'Saját jelszavad — bcrypt match a backend-en',
            'admin.token_rotates':  'Sikeres végrehajtás után az admin token automatikusan rotálódik (új 15 perc).',
            'admin.execute_action': 'Művelet végrehajtása',
            'admin.ip_block':       'IP cím blokkolása',
            'admin.ip_block_warning':'A blokkolt IP nem fér hozzá az oldalhoz egészen a lejáratig (vagy véglegesen). A művelet naplózásra kerül (severity: critical).',
            'admin.ip_address':     'IP cím',
            'admin.type':           'Típus',
            'admin.temporary':      'Ideiglenes',
            'admin.permanent':      'Végleges',
            'admin.duration_hours': 'Időtartam (óra)',
            'admin.reason_min10':   '(min. 10 karakter)',
            'admin.ip_reason_ph':   'Például: ismétlődő spam regisztráció, token brute-force...',
            'admin.apply_block':    'Blokk alkalmazása',
            'admin.user_restore':   'Felhasználó visszaállítása',
            'admin.restore_warning':'A felhasználó visszaáll a normál állapotba: újra be tud lépni, az összes adata (barátok, meccsek, profil) érintetlen. A művelet naplózásra kerül.',
            'admin.user':           'Felhasználó',
            'admin.original_deletion':'Eredeti törlési határidő',
            'admin.restore':        'Visszaállítás',

            // ── Chat moderálás modálok ──
            'admin.blocklist_add_title':'Hozzáadás a tiltott szavak listájához',
            'admin.blocklist_add_warning':'A kiválasztott szavak <strong>azonnal</strong> bekerülnek a dinamikus blocklist-be (perzisztens, runtime-cache). Ezután minden új chat üzenet, amely ezen szavak valamelyikét tartalmazza, <strong>automatikusan maszkolva</strong> kerül mentésre. Ez naplózásra kerül (severity: critical).',
            'admin.blocklist_source_message':'Forrás üzenet:',
            'admin.blocklist_words_label':'Szavak az üzenetből',
            'admin.blocklist_no_words':'Nincs választható szó.',
            'admin.blocklist_words_hint':'A 3 karakternél rövidebb szavak és a már listán lévők ki vannak hagyva. Pipáld be amelyiket trágárnak ítéled.',
            'admin.reason':         'Indok',
            'admin.blocklist_reason_ph':'Min. 10 karakter — pl. ismétlődő szabálysértés, sértő tartalom, közösségi normák megsértése...',
            'admin.blocklist_add_btn':'Hozzáadás a blocklisthez',
            'admin.chat_allow_title':'Chat üzenet engedélyezése',
            'admin.chat_allow_warning':'Az engedélyezéssel a profanity-filter által <strong>maszkolt</strong> üzenetről leveszed a maszkot. A résztvevők ezután az eredeti szöveget látják. A művelet <strong>naplózásra kerül</strong>.',
            'admin.chat_sender':    'Feladó:',
            'admin.chat_allow_reason_label':'Felülbírálás indoka',
            'admin.chat_allow_reason_ph':'Min. 10 karakter — pl. szövegkörnyezetben rendben van, nem szabálysértő...',
            'admin.chat_allow_btn': 'Engedélyezés megerősítése',
            'admin.image_reject_title':'Profilkép elutasítása',
            'admin.image_reject_warning':'Az elutasítás után a feltöltő publikus profilképe <strong>visszaáll az alapértelmezettre</strong>. Az indok <strong>naplózásra kerül</strong>.',
            'admin.image_reject_user':'Felhasználó:',
            'admin.image_reject_reason_label':'Elutasítás indoka',
            'admin.image_reject_reason_ph':'Min. 10 karakter — pl. szabálysértő tartalom, sértő ábrázolás, alacsony minőség...',
            'admin.image_reject_btn':'Elutasítás megerősítése',
            'admin.admin_image_crop':'Profilkép kivágása — admin',
            'admin.admin_image_hint':'A képet húzással mozgathatod, zoomolhatod és forgathatod. Az admin által feltöltött kép azonnal jóváhagyott státuszt kap.',
            'admin.admin_image_save_hint':'A kép azonnal jóváhagyottként kerül mentésre.',
            'admin.admin_image_save':'Mentés és jóváhagyás',
            'admin.tests_run_title':'Tesztek futtatása',
            'admin.tests_run_hint':'A backend Jest + Supertest tesztkészlete fut le (~5-10 mp). Egyszerre csak egy futás lehetséges. A futás naplózva lesz az audit log-ba (info szintű bejegyzés).',
            'admin.note_optional':  'Megjegyzés',
            'admin.tests_note_ph':  'Pl.: utolsó PR előtti smoke-test — üresen is hagyható.',
            'admin.tests_run_btn':  'Indítás',
            'admin.quick_chat_title':'Üzenet küldése —',
            'admin.quick_chat_intro':'Az üzenet egy direkt beszélgetésben (1-az-1) érkezik a felhasználónak. Ha még nem volt direkt-conv, a rendszer most létrehozza.',
            'admin.message':        'Üzenet',
            'admin.quick_chat_ph':  'Írd ide az üzenetet...',
            'admin.send':           'Küldés',
            'admin.grant_admin_title':'Admin szerep adása',
            'admin.grant_admin_intro':'Add meg a felhasználónevet, akinek admin szerepet szeretnél adni. A művelet kritikus, ezért egy további indoklást és jelszó-megerősítést is kérni fogunk.',
            'admin.grant_admin_label':'Felhasználónév',
            'admin.grant_admin_ph': 'pl.: SakkMester99',
            'admin.grant_super_check':'Super-admin jogot is adjon',
            'admin.continue':       'Tovább',
            'admin.spectator':      'Spectator',
            'admin.spectator_hint': 'A meccs lépései élő realtime jönnek a /admin WebSocketről.',
            'admin.spectator_loading':'Töltés...',
            'admin.spectator_close':'Bezár',
            'admin.optional':       '(opcionális)',
            'admin.ability':        'Képesség',
            'admin.ability_name':   'Név',
            'admin.ability_cooldown':'Cooldown (kör)',
            'admin.ability_description':'Leírás',
            'admin.ability_reason_label':'Indoklás',
            'admin.ability_reason_ph':'Naplózásra kerülő indoklás — üresen is hagyható.',
            'admin.save':           'Mentés',

            // ── Chess oldal ──
            'chess.surrender':      'Feladás',
            'chess.draw_offer':     'Döntetlen ajánlat',
            'chess.rematch':        'Revans',
            'chess.new_game':       'Új játék',
            'chess.home':           'Főoldal',
            'chess.your_turn':      'Te jössz',
            'chess.opp_turn':       'Ellenfél jön',
            'chess.checkmate':      'Matt!',
            'chess.draw':           'Döntetlen',
            'chess.connecting':     'Visszacsatlakozás folyamatban...',
            'chess.opponent':       'Ellenfél',
            'chess.you':            'Te',
            'chess.board_hidden':   'Tábla eltakarva',
            'chess.draw_received':  'Döntetlen ajánlatot kaptál',
            'chess.draw_send':      'Döntetlen ajánlása',
            'chess.flip_board':     'Tábla forgatása',
            'chess.help':           'Segítség',
            'chess.settings':       'Beállítások',
            'chess.move_history':   'Lépés történet',
            'chess.captured':       'Leütött bábuk',
            'chess.opp_disconnected':'Ellenfél kapcsolata megszakadt',
            'chess.lost_connection':'Kapcsolat megszakadt',
            'chess.accept':         'Elfogad',
            'chess.decline':        'Elutasít',
            'chess.reconnecting_title':'Visszacsatlakozás a meccsedhez…',
            'chess.reconnecting_sub':'Az időd a szerveren tovább fut, addig is kérlek várj.',
            'chess.waiting_opponent':'Várakozás az ellenfélre...',
            'chess.cancel':         'Mégsem',
            'chess.invite_text':    'sakkpartira hív!',
            'chess.accept_invite':  'Elfogadom',
            'chess.decline_invite': 'Elutasítom',
            'chess.chat':           'Beszélgetés',
            'chess.chat_empty':     'Még nincs üzenet — szólj az ellenfélnek!',
            'chess.qc_gl':          'Sok szerencsét!',
            'chess.qc_hello':       'Hello!',
            'chess.qc_nice':        'Szép lépés!',
            'chess.qc_wow':         'Hűha!',
            'chess.qc_oops':        'Hopp!',
            'chess.qc_thinking':    'Gondolkodok…',
            'chess.qc_thanks':      'Köszi a meccset!',
            'chess.qc_wp':          'Jól játszottál!',
            'chess.qc_gg':          'GG',
            'chess.message_ph':     'Üzenet…',
            'chess.send':           'Küld',
            'chess.active':         'Aktív',
            'chess.white':          'fehér',
            'chess.black':          'fekete',
            'chess.in_game':        'játékon',
            'chess.you_label':      'Te',
            'chess.points':         'Pontok',
            'chess.bot_thinking':   '🤖 A bot gondolkodik...',
            'chess.draw_offer_btn': 'Döntetlen ajánlat',
            'chess.opp_offers_draw':'Ellenfeled döntetlent ajánl',
            'chess.moves':          'Lépések',
            'chess.no_moves_yet':   'Még nincs lépés',
            'chess.flip_board_title':'Tábla forgatás',
            'chess.settings_title': 'Beállítások',
            'chess.opp_dc_text':    'Ellenfél kapcsolata megszakadt — visszacsatlakozás:',
            'chess.captured_pieces':'Leütött bábuk',
            'chess.opp_wants_rematch':'Ellenfeled revans-t kér!',
            'chess.board_hidden_label':'Tábla eltakarva',
            'chess.settings_title_full':'Beállítások',
            'chess.board_theme':    'Tábla téma',
            'chess.theme_gold':     'Arany (alap)',
            'chess.theme_green':    'Zöld',
            'chess.theme_brown':    'Fa',
            'chess.theme_blue':     'Kék',
            'chess.sound':          'Hang',
            'chess.coords':         'Koordináták (a–h, 1–8)',
            'chess.smooth_anim':    'Sima lépés-animáció',
            'chess.auto_flip':      'Auto-flip black-ként',
            'chess.done':           'Kész',
            'chess.game_over':      'Játék vége',
            'chess.legend':         'Jelmagyarázat',
            'chess.last_move':      'Utolsó lépés',
            'chess.capture':        'Ütés lehetőség',
            'chess.king_check':     'Király sakkban',
            'chess.en_passant':     'En passant',
            'chess.castle':         'Sáncolás',
            'chess.promotion':      'Átváltozás',
            'chess.help_legend':    'Segítség / jelmagyarázat',
            'chess.surrender_confirm':'Biztos fel akarod adni?',
            'chess.long_press':     'Nyomd hosszan:',
            'chess.long_press_hint':'(Nyomja hosszan)'
        },

        en: {
            'nav.greeting':         'Hello',
            'nav.profile_settings': 'Profile settings',
            'nav.admin_panel':      'Admin panel',
            'nav.logout':           'Log out',

            'common.cancel':        'Cancel',
            'common.confirm':       'Confirm',
            'common.save':          'Save',
            'common.close':         'Close',
            'common.send':          'Send',
            'common.loading':       'Loading...',
            'common.yes':           'Yes',
            'common.no':            'No',
            'common.error':         'Error',
            'common.success':       'Success',
            'common.back':          'Back',
            'common.next':          'Next',
            'common.delete':        'Delete',
            'common.edit':          'Edit',
            'common.search':        'Search',
            'common.filter':        'Filter',
            'common.actions':       'Actions',
            'common.username':      'Username',
            'common.email':         'Email',
            'common.password':      'Password',
            'common.done':          'Done',
            'common.reason':        'Reason',

            'index.live_chess_platform': 'Live community chess platform',
            'index.hero_title':     'Play, improve, climb the leaderboard',
            'index.hero_subtitle':  'Compete in Mattmester, Classical or Bot mode. Start instantly as a guest, or track your ELO progress with an account.',
            'index.play':           'Play',
            'index.leaderboard':    'Leaderboard',
            'index.login':          'Sign in',
            'index.register':       'Sign up',
            'index.classical':      'Classical',
            'index.mattmester':     'MattMester',
            'index.bullet':         'Bullet',
            'index.winrate':        'Win rate',
            'index.elo':            'ELO',
            'index.win_ratio':      'Wins ratio',
            'index.all_players':    'All players',
            'index.registered_accounts': 'registered accounts',
            'index.online_players': 'Online players',
            'index.now_active':     'currently active',
            'index.live_games':     'Live games',
            'index.now_running':    'in progress',
            'index.all_games':      'All games',
            'index.played_with_us': 'Total games played here',
            'index.top_players':    'Top players by ELO',
            'index.updated':        'Updated: today',
            'index.sort_by':        'Sort:',
            'index.elo_mattmester': 'ELO MattMester',
            'index.elo_bullet':     'ELO Bullet',
            'index.limit':          'Limit:',
            'index.top10':          'Top 10',
            'index.top25':          'Top 25',
            'index.top100':         'Top 100',
            'index.rank':           '#',
            'index.player':         'Player',
            'index.last_seen':      'Last seen',
            'index.user_since':     'Member since',
            'index.no_results':     'No results match the selected filters.',
            'index.modern_chess':   'Modern chess experience',
            'index.rules':          'Rules',

            'login.title':          'Sign in',
            'login.username_label': 'Username/Email:',
            'login.username_ph':    'mattmester / mattmester@gmail.com',
            'login.password_label': 'Password:',
            'login.password_ph':    'Password',
            'login.remember_me':    'Remember me:',
            'login.forgot':         'Forgot password?',
            'login.submit':         'Sign in',

            'forgot.title':         'Reset password',
            'forgot.heading':       'Request new password',
            'forgot.note':          'Enter your account email and we will send a reset link.',
            'forgot.email_label':   'Email address',
            'forgot.email_ph':      'mattmester@gmail.com',
            'forgot.send':          'Send email',
            'forgot.back_login':    'Back to sign in',

            'register.title':       'Sign up',
            'register.username_label':'Username',
            'register.username_ph': 'mattmester',
            'register.email_label': 'Email:',
            'register.email_ph':    'mattmester@gmail.com',
            'register.password_label':'Password:',
            'register.password_ph': 'Password',
            'register.submit':      'Sign up',

            'toast.done':           'Done.',

            'profile.title':        'Profile',
            'profile.dashboard':    'Overview',
            'profile.stats':        'Statistics',
            'profile.history':      'Game history',
            'profile.friends':      'Friends',
            'profile.settings':     'Settings',
            'profile.security':     'Security',
            'profile.notifications':'Notifications',
            'profile.messages':     'Messages',
            'profile.logout_confirm':'Are you sure you want to log out?',
            'profile.profile_image':'Profile picture',
            'profile.change_image': 'Change picture',
            'profile.account':      'Account',
            'profile.danger_zone':  'Danger zone',
            'profile.delete_account':'Delete account',
            'profile.change_password':'Change password',
            'profile.recent_games': 'Recent games',
            'profile.wins':         'Wins',
            'profile.losses':       'Losses',
            'profile.draws':        'Draws',
            'profile.abilities_used':'Abilities used',
            'profile.online':       'Online',
            'profile.offline':      'Offline',
            'profile.add_friend':   'Add friend',
            'profile.no_friends':   "You don't have any friends yet.",
            'profile.no_history':   'No games yet.',
            'profile.search_players':'Search players',
            'profile.search_players_ph':'Search players...',
            'profile.profile_image_status':'Profile picture status',
            'profile.recent_opponents':'Recent opponents',
            'profile.recent_opponents_hint':'Max 25 · click to interact',
            'profile.no_opponents': "You haven't played anyone yet — start a match!",
            'profile.ability_usage':'Ability usage',
            'profile.friends_loading':'Loading friends...',
            'profile.friend_all':   'All',
            'profile.friend_pending':'Pending',
            'profile.friend_friend':'Friends',
            'profile.friend_blocked':'Blocked',
            'profile.account_status':'Account status',
            'profile.email_verification':'Email verification',
            'profile.email_checking':'Checking',
            'profile.account_type': 'Account type',
            'profile.player_role':  'Player',
            'profile.status':       'Status',
            'profile.active':       'Active',
            'profile.email_required':'Email verification required',
            'profile.email_required_hint':"Click resend if you didn't receive it.",
            'profile.resend_verification':'Resend verification email',
            'profile.resend_hint':  "If you don't receive it, check spam/promotions too.",
            'profile.member_since': 'Member since',
            'profile.security_activity':'Security and activity',
            'profile.filter_session':'Session',
            'profile.filter_security':'Security',
            'profile.filter_profile':'Profile',
            'profile.filter_social':'Social',
            'profile.refresh':      'Refresh',
            'profile.logout_all':   'Log out all devices',
            'profile.time':         'Time',
            'profile.event':        'Event',
            'profile.ip':           'IP address',
            'profile.device':       'Device / Browser',
            'profile.security_loading':'Loading security log...',
            'profile.profile_settings':'Profile settings',
            'profile.upload_new':   'Upload new',
            'profile.remove':       'Remove',
            'profile.image_approved':'Profile picture status: Approved',
            'profile.email_address':'Email address',
            'profile.new_password': 'New password',
            'profile.new_password_ph':'Leave blank to keep current',
            'profile.confirm_password':'Confirm new password',
            'profile.confirm_password_ph':'Confirm new password',
            'profile.save_changes': 'Save changes',
            'profile.danger_zone_title':'Danger zone',
            'profile.delete_warning':'Deleting your profile is permanent and cannot be undone.',
            'profile.delete_profile':'Delete profile',
            'profile.notif_title':  'Notifications',
            'profile.no_notif':     'No new notifications.',
            'profile.mark_all_read':'Mark all read',
            'profile.quick_play':   'Quick Play',
            'profile.logout_title': 'Confirm log out',
            'profile.logout_q':     'Are you sure you want to log out?',
            'profile.logout_all_title':'Log out of all devices',
            'profile.logout_all_q': 'Are you sure you want to log out of all devices?',
            'profile.logout_all_hint':'All active sessions will end, and you will need to sign in again on this device too.',
            'profile.logout_all_btn':'Log out of all devices',
            'profile.add_friend_title':'Add friend',
            'profile.friend_username_ph':'e.g. ChessWizard88',
            'profile.send_request': 'Send request',
            'profile.search_results':'Search results',
            'profile.results_loading':'Loading results...',
            'profile.no_search_results':'No results match your search.',
            'profile.player_profile':'Player profile',
            'profile.joined':       'Joined',
            'profile.last_active':  'Last active',
            'profile.beginner':     'Beginner',
            'profile.delete_perm':  'This action permanently removes your profile data from this session.',
            'profile.delete_password_label':'Enter your password to confirm:',
            'profile.password_input_ph':'Enter password',
            'profile.delete_ack':   'I understand this action cannot be undone.',
            'profile.delete_btn':   'Delete',
            'profile.remove_avatar_title':'Remove profile picture',
            'profile.remove_avatar_q':'Are you sure you want to reset your profile picture to default?',
            'profile.remove_avatar_btn':'Remove',
            'profile.image_crop':   'Crop profile picture',
            'profile.image_crop_hint':'Drag to move, zoom and rotate the image.',
            'profile.zoom':         'Zoom',
            'profile.rotate':       'Rotate',
            'profile.preview':      'Preview',
            'profile.reset':        'Reset',
            'profile.image_norm':   'The image must meet social standards. (forbidden: NSFW, banned symbols) abusing the policy is not allowed and may lead to a ban...',
            'profile.confirm_change':'Confirm change',
            'profile.confirm_change_q':'Are you sure you want to save the following changes?',
            'profile.current_password':'Current password',
            'profile.current_password_ph':'Enter your current password to save',
            'profile.confirm_hint': 'The save button will activate in 10 seconds.',
            'profile.top_nav_aria': 'Top navigation',
            'profile.sidebar_toggle_aria':'Toggle sidebar',
            'profile.friends_filter_aria':'Filter friends list',
            'profile.friends_refresh_aria':'Refresh friends list',
            'profile.friends_add_aria':'Search players and add friends',
            'profile.security_filter_aria':'Filter security log',
            'profile.email_ph':     'email@example.com',
            'profile.player_alt':   'Player profile picture',

            'cmc.new_match':        'New match',
            'cmc.choose_mode':      'Choose a game mode',
            'cmc.vs_bot':           'Vs. bot',
            'cmc.vs_player':        'Vs. player',
            'cmc.back':             '← Back',
            'cmc.bot_difficulty':   'Bot difficulty',
            'cmc.casual_no_elo':    '(casual, ELO does not update)',
            'cmc.ranked':           'Ranked',
            'cmc.ranked_hint':      'ELO updates (timed modes only)',
            'cmc.invite_friend':    'Invite friend',
            'cmc.random_opp':       'Random opponent',
            'cmc.choose_opp':       'Choose an opponent',
            'cmc.searching_opp':    'Searching for opponent',
            'cmc.waiting':          'Waiting',
            'cmc.for_response':     'for response',
            'cmc.cancel_invite':    'Cancel invite',
            'cmc.your_elo':         'Your ELO',

            'admin.title':          'Admin Panel',
            'admin.dashboard':      'Dashboard',
            'admin.users':          'Users',
            'admin.users_list':     'List',
            'admin.user_details':   'Details and edit',
            'admin.bans':           'Bans',
            'admin.user_delete':    'Delete user',
            'admin.user_create':    'New user',
            'admin.moderation':     'Moderation',
            'admin.chat_moderation':'Chat moderation',
            'admin.profile_images': 'Profile images',
            'admin.reports':        'Reports',
            'admin.gameplay':       'Games',
            'admin.games':          'Matches',
            'admin.abilities':      'Abilities',
            'admin.logs':           'Logs',
            'admin.security_logs':  'Logins',
            'admin.audit_log':      'Audit log',
            'admin.alerts':         'Alerts',
            'admin.super_admin':    'Super admin',
            'admin.friends':        'Social connections',
            'admin.tests':          'Tests',
            'admin.settings':       'Settings',
            'admin.full_logout':    'Full log out',
            'admin.full_logout_msg':'This will log you out of both the admin panel and the home page.',
            'admin.full_logout_hint':'If you only want to return to the home page (while staying logged in), click the MATTMESTER logo in the top-left instead.',
            'admin.search_placeholder':'Search...',
            'admin.no_data':        'No data',
            'admin.created_at':     'Created',
            'admin.last_active':    'Last active',
            'admin.role':           'Role',
            'admin.status':         'Status',
            'admin.notif_title':    'Notifications',
            'admin.no_notif':       'No new notifications.',
            'admin.alert_messages': 'Message',
            'admin.send_message':   'Send message',
            'admin.allow_message':  'Allow message',
            'admin.add_blocklist':  'Add blocked words',
            'admin.blocklist_intro':'After this, every new chat message containing any of these words will be blocked automatically.',
            'admin.message_id':     'Message ID',
            'admin.words':          'Words',
            'admin.add':            'Add',
            'admin.allow':          'Allow',
            'admin.character_count':'characters',
            'admin.token':          'Token',
            'admin.token_refresh':  'Refresh admin token',
            'admin.token_title':    'Admin token validity — click to refresh',
            'admin.alerts_jump':    'Alerts — jump to Alerts page',
            'admin.user_details_title':'User details',
            'admin.profile_image':  'Profile picture',
            'admin.email_status':   'Email status',
            'admin.classical':      'Classical',
            'admin.mattmester':     'MattMester',
            'admin.bullet':         'Bullet',
            'admin.win':            'Wins',
            'admin.loss':           'Losses',
            'admin.draw':           'Draws',
            'admin.win_rate':       'Win rate',
            'admin.last_active_label':'Last active',
            'admin.joined':         'Joined',
            'admin.last_ip':        'Last IP',
            'admin.what_happened':  'Happened to them',
            'admin.he_did':         'They did',
            'admin.security_log':   'Security log',
            'admin.audit_last100':  'Audit log — last 100',
            'admin.loading_logs':   'Loading log entries…',
            'admin.switch_tab':     'Switch tab to load.',
            'admin.filter_all':     'All',
            'admin.filter_session': 'Session',
            'admin.filter_security':'Security',
            'admin.filter_profile': 'Profile',
            'admin.filter_social':  'Social',
            'admin.ban':            'Ban',
            'admin.edit':           'Edit',
            'admin.new_user':       'New user',
            'admin.new_user_username_ph':'Enter the username',
            'admin.new_user_email': 'Email',
            'admin.new_user_email_ph':'Enter the email address',
            'admin.role_label':     'Role',
            'admin.role_player':    'Player',
            'admin.role_admin':     'Administrator',
            'admin.initial_elo':    'Initial ELO',
            'admin.reason_audit':   'Reason (audit)',
            'admin.reason_audit_ph':'E.g.: New team member onboarding (at least 10 characters)',
            'admin.reason_audit_hint':'The reason is recorded in the admin audit log.',
            'admin.create_user':    'Create user',
            'admin.elevate_title':  'Activate admin level',
            'admin.elevate_info':   'Beyond your session login, admin actions require a 15-minute step-up token. Enter your password to issue it.',
            'admin.your_password':  'Your password',
            'admin.exit':           'Exit',
            'admin.activate_15min': 'Activate (15 min)',
            'admin.critical_title': 'Confirm critical action',
            'admin.critical_warning':'This action will be logged and cannot be undone. To continue, provide a reason of at least 10 characters and your password.',
            'admin.reason_label':   'Reason',
            'admin.reason_ph':      'Reason to be logged (min. 10 characters)...',
            'admin.confirm_password':'Confirm password',
            'admin.confirm_password_ph':'Your password — bcrypt-matched on the backend',
            'admin.token_rotates':  'On success the admin token is rotated automatically (new 15 minutes).',
            'admin.execute_action': 'Execute action',
            'admin.ip_block':       'Block IP address',
            'admin.ip_block_warning':'The blocked IP cannot access the site until expiry (or permanently). This action is logged (severity: critical).',
            'admin.ip_address':     'IP address',
            'admin.type':           'Type',
            'admin.temporary':      'Temporary',
            'admin.permanent':      'Permanent',
            'admin.duration_hours': 'Duration (hours)',
            'admin.reason_min10':   '(min. 10 characters)',
            'admin.ip_reason_ph':   'E.g.: repeated spam registrations, token brute-force...',
            'admin.apply_block':    'Apply block',
            'admin.user_restore':   'Restore user',
            'admin.restore_warning':'The user is restored to normal state: they can sign in again and all their data (friends, matches, profile) is intact. This action is logged.',
            'admin.user':           'User',
            'admin.original_deletion':'Original deletion deadline',
            'admin.restore':        'Restore',

            'admin.blocklist_add_title':'Add to blocked words list',
            'admin.blocklist_add_warning':'The selected words will be added to the dynamic blocklist <strong>immediately</strong> (persistent, runtime-cache). After that, every new chat message containing any of these words will be saved <strong>automatically masked</strong>. This is logged (severity: critical).',
            'admin.blocklist_source_message':'Source message:',
            'admin.blocklist_words_label':'Words from the message',
            'admin.blocklist_no_words':'No selectable words.',
            'admin.blocklist_words_hint':'Words shorter than 3 characters and those already on the list are skipped. Tick the ones you consider profane.',
            'admin.reason':         'Reason',
            'admin.blocklist_reason_ph':'Min. 10 characters — e.g. repeated rule violations, offensive content, breach of community standards...',
            'admin.blocklist_add_btn':'Add to blocklist',
            'admin.chat_allow_title':'Allow chat message',
            'admin.chat_allow_warning':'Allowing it removes the mask placed by the profanity filter on the <strong>masked</strong> message. Participants will then see the original text. This action <strong>is logged</strong>.',
            'admin.chat_sender':    'Sender:',
            'admin.chat_allow_reason_label':'Override reason',
            'admin.chat_allow_reason_ph':'Min. 10 characters — e.g. fine in context, not a violation...',
            'admin.chat_allow_btn': 'Confirm allow',
            'admin.image_reject_title':'Reject profile picture',
            'admin.image_reject_warning':"After rejection the uploader's public profile picture <strong>reverts to the default</strong>. The reason <strong>is logged</strong>.",
            'admin.image_reject_user':'User:',
            'admin.image_reject_reason_label':'Rejection reason',
            'admin.image_reject_reason_ph':'Min. 10 characters — e.g. policy violation, offensive depiction, low quality...',
            'admin.image_reject_btn':'Confirm rejection',
            'admin.admin_image_crop':'Crop profile picture — admin',
            'admin.admin_image_hint':'Drag to move, zoom and rotate the image. Pictures uploaded by an admin become approved immediately.',
            'admin.admin_image_save_hint':'The image is saved as approved immediately.',
            'admin.admin_image_save':'Save and approve',
            'admin.tests_run_title':'Run tests',
            'admin.tests_run_hint':'The backend Jest + Supertest suite runs (~5-10 sec). Only one run at a time. The run is logged in the audit log (info-level entry).',
            'admin.note_optional':  'Note',
            'admin.tests_note_ph':  'E.g.: smoke-test before the latest PR — can be left empty.',
            'admin.tests_run_btn':  'Start',
            'admin.quick_chat_title':'Send message —',
            'admin.quick_chat_intro':'The message arrives in a 1-to-1 direct conversation for the user. If no direct-conv exists yet, the system creates one now.',
            'admin.message':        'Message',
            'admin.quick_chat_ph':  'Type the message...',
            'admin.send':           'Send',
            'admin.grant_admin_title':'Grant admin role',
            'admin.grant_admin_intro':'Provide the username you want to grant admin role to. The action is critical, so a reason and password confirmation will also be requested.',
            'admin.grant_admin_label':'Username',
            'admin.grant_admin_ph': 'e.g. SakkMester99',
            'admin.grant_super_check':'Also grant super-admin rights',
            'admin.continue':       'Continue',
            'admin.spectator':      'Spectator',
            'admin.spectator_hint': 'Match moves arrive in real time over the /admin WebSocket.',
            'admin.spectator_loading':'Loading...',
            'admin.spectator_close':'Close',
            'admin.optional':       '(optional)',
            'admin.ability':        'Ability',
            'admin.ability_name':   'Name',
            'admin.ability_cooldown':'Cooldown (turns)',
            'admin.ability_description':'Description',
            'admin.ability_reason_label':'Reason',
            'admin.ability_reason_ph':'Reason to be logged — can be left empty.',
            'admin.save':           'Save',

            'chess.surrender':      'Resign',
            'chess.draw_offer':     'Offer draw',
            'chess.rematch':        'Rematch',
            'chess.new_game':       'New game',
            'chess.home':           'Home',
            'chess.your_turn':      'Your turn',
            'chess.opp_turn':       "Opponent's turn",
            'chess.checkmate':      'Checkmate!',
            'chess.draw':           'Draw',
            'chess.connecting':     'Reconnecting...',
            'chess.opponent':       'Opponent',
            'chess.you':            'You',
            'chess.board_hidden':   'Board hidden',
            'chess.draw_received':  'You received a draw offer',
            'chess.draw_send':      'Offer draw',
            'chess.flip_board':     'Flip board',
            'chess.help':           'Help',
            'chess.settings':       'Settings',
            'chess.move_history':   'Move history',
            'chess.captured':       'Captured pieces',
            'chess.opp_disconnected':"Opponent's connection lost",
            'chess.lost_connection':'Connection lost',
            'chess.accept':         'Accept',
            'chess.decline':        'Decline',
            'chess.reconnecting_title':'Reconnecting to your match…',
            'chess.reconnecting_sub':'Your clock keeps running on the server — please wait.',
            'chess.waiting_opponent':'Waiting for opponent...',
            'chess.cancel':         'Cancel',
            'chess.invite_text':    'is challenging you to a chess match!',
            'chess.accept_invite':  'Accept',
            'chess.decline_invite': 'Decline',
            'chess.chat':           'Chat',
            'chess.chat_empty':     'No messages yet — say hi to your opponent!',
            'chess.qc_gl':          'Good luck!',
            'chess.qc_hello':       'Hello!',
            'chess.qc_nice':        'Nice move!',
            'chess.qc_wow':         'Wow!',
            'chess.qc_oops':        'Oops!',
            'chess.qc_thinking':    'Thinking…',
            'chess.qc_thanks':      'Thanks for the match!',
            'chess.qc_wp':          'Well played!',
            'chess.qc_gg':          'GG',
            'chess.message_ph':     'Message…',
            'chess.send':           'Send',
            'chess.active':         'Active',
            'chess.white':          'white',
            'chess.black':          'black',
            'chess.in_game':        'in game',
            'chess.you_label':      'You',
            'chess.points':         'Points',
            'chess.bot_thinking':   '🤖 The bot is thinking...',
            'chess.draw_offer_btn': 'Offer draw',
            'chess.opp_offers_draw':'Your opponent offers a draw',
            'chess.moves':          'Moves',
            'chess.no_moves_yet':   'No moves yet',
            'chess.flip_board_title':'Flip board',
            'chess.settings_title': 'Settings',
            'chess.opp_dc_text':    "Opponent's connection lost — reconnecting:",
            'chess.captured_pieces':'Captured pieces',
            'chess.opp_wants_rematch':'Your opponent wants a rematch!',
            'chess.board_hidden_label':'Board hidden',
            'chess.settings_title_full':'Settings',
            'chess.board_theme':    'Board theme',
            'chess.theme_gold':     'Gold (default)',
            'chess.theme_green':    'Green',
            'chess.theme_brown':    'Wood',
            'chess.theme_blue':     'Blue',
            'chess.sound':          'Sound',
            'chess.coords':         'Coordinates (a–h, 1–8)',
            'chess.smooth_anim':    'Smooth move animation',
            'chess.auto_flip':      'Auto-flip when black',
            'chess.done':           'Done',
            'chess.game_over':      'Game over',
            'chess.legend':         'Legend',
            'chess.last_move':      'Last move',
            'chess.capture':        'Capture',
            'chess.king_check':     'King in check',
            'chess.en_passant':     'En passant',
            'chess.castle':         'Castling',
            'chess.promotion':      'Promotion',
            'chess.help_legend':    'Help / legend',
            'chess.surrender_confirm':'Are you sure you want to resign?',
            'chess.long_press':     'Long-press:',
            'chess.long_press_hint':'(long-press)'
        }
    };

    function readStoredLang() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (SUPPORTED.includes(raw)) return raw;
        } catch (_) { /* ignore */ }
        return DEFAULT_LANG;
    }

    function persistLang(lang) {
        try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* ignore */ }
    }

    let currentLang = readStoredLang();

    function t(key, fallback) {
        const dict = DICT[currentLang] || DICT[DEFAULT_LANG];
        if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
            return dict[key];
        }
        if (fallback != null) return fallback;
        return key;
    }

    function applyToElement(el) {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const dict = DICT[currentLang] || DICT[DEFAULT_LANG];
            if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
                el.textContent = dict[key];
            }
        }
        const htmlKey = el.getAttribute('data-i18n-html');
        if (htmlKey) {
            const dict = DICT[currentLang] || DICT[DEFAULT_LANG];
            if (dict && Object.prototype.hasOwnProperty.call(dict, htmlKey)) {
                el.innerHTML = dict[htmlKey];
            }
        }
        const attrSpec = el.getAttribute('data-i18n-attr');
        if (attrSpec) {
            attrSpec.split(',').forEach((pair) => {
                const [attr, k] = pair.split(':').map((s) => s.trim());
                if (!attr || !k) return;
                const val = t(k);
                if (val !== k) el.setAttribute(attr, val);
            });
        }
    }

    // A natív <input type="date"|"datetime-local"|"time"> picker-eket a böngészők
    // a `lang` attribútum alapján renderelik (HU vs. EN naptár). A documentElement
    // `lang` váltása nem frissíti a már létrehozott picker DOM-ot a legtöbb
    // böngészőben — ezért minden ilyen input-ra egyenként ki kell setelni a
    // `lang` attribútumot, és Firefox-on egy reflow-trükkel újra-rajzoltatni.
    function syncDatePickerLang(scope) {
        try {
            const root = scope || document;
            if (!root.querySelectorAll) return;
            const pickers = root.querySelectorAll('input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"], input[type="week"]');
            pickers.forEach((el) => {
                try {
                    if (el.getAttribute && el.getAttribute('lang') !== currentLang) {
                        el.setAttribute('lang', currentLang);
                        // Firefox quirk: reflow trigger, hogy a picker UI is frissuljon.
                        if (el.style && typeof el.offsetHeight === 'number') {
                            const prev = el.style.display;
                            el.style.display = 'none';
                            // eslint-disable-next-line no-unused-expressions
                            void el.offsetHeight;
                            el.style.display = prev || '';
                        }
                    }
                } catch (_) { /* per-element ignore */ }
            });
        } catch (_) { /* ignore */ }
    }

    function applyAll(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]').forEach(applyToElement);
        if (document.documentElement) {
            document.documentElement.setAttribute('lang', currentLang);
        }
        // Date/time picker locale szinkronizalas — a documentElement.lang valtas
        // nem frissiti az `<input type="date">` natív UI-t, kell explicit attr.
        syncDatePickerLang(scope);
    }

    const langChangeHandlers = new Set();

    function set(lang) {
        if (!SUPPORTED.includes(lang)) return false;
        if (lang === currentLang) return true;
        currentLang = lang;
        persistLang(lang);
        applyAll();
        // Belso re-render listenerek (modulok regisztralhatjak magukat onLangChange-zsel)
        langChangeHandlers.forEach((fn) => {
            try { fn(lang); } catch (e) { console.warn('[i18n] onLangChange handler hiba:', e?.message || e); }
        });
        try {
            window.dispatchEvent(new CustomEvent('mm:lang-changed', { detail: { lang } }));
        } catch (_) { /* ignore */ }
        return true;
    }

    function get() { return currentLang; }

    // tx(huString, enString) — inline HU/EN kapcsolo, kulcs nelkul.
    // Hasznos olyan dinamikus szovegekhez, amelyeket nem akarunk a DICT-be kulcsozni
    // (toastok, validacios uzenetek, status feliratok, runtime kommunikacio).
    function tx(hu, en) {
        if (currentLang === 'en' && en != null) return en;
        return hu != null ? hu : (en || '');
    }

    // Regisztracio: a callback minden nyelvvaltaskor lefut (jelenlegi nyelvvel).
    // Visszaad egy unsubscribe fuggvenyt.
    function onLangChange(fn) {
        if (typeof fn !== 'function') return () => {};
        langChangeHandlers.add(fn);
        return () => langChangeHandlers.delete(fn);
    }

    // Lokalizalt datum/ido formazas — automatikusan a current lang szerint formaz.
    function formatDate(value, opts) {
        const locale = currentLang === 'en' ? 'en-GB' : 'hu-HU';
        try {
            const d = (value instanceof Date) ? value : new Date(value);
            if (Number.isNaN(d.getTime())) return '–';
            return d.toLocaleDateString(locale, opts || { year: 'numeric', month: '2-digit', day: '2-digit' });
        } catch (_) { return '–'; }
    }
    function formatDateTime(value, opts) {
        const locale = currentLang === 'en' ? 'en-GB' : 'hu-HU';
        try {
            const d = (value instanceof Date) ? value : new Date(value);
            if (Number.isNaN(d.getTime())) return '–';
            return d.toLocaleString(locale, opts);
        } catch (_) { return '–'; }
    }

    function bindToggleControls() {
        document.querySelectorAll('[data-i18n-toggle]').forEach((btn) => {
            const target = btn.getAttribute('data-i18n-toggle');
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                if (target === 'cycle') {
                    set(currentLang === 'hu' ? 'en' : 'hu');
                } else if (SUPPORTED.includes(target)) {
                    set(target);
                }
                refreshToggleActive();
            });
        });
        refreshToggleActive();
    }

    function refreshToggleActive() {
        document.querySelectorAll('[data-i18n-toggle]').forEach((btn) => {
            const target = btn.getAttribute('data-i18n-toggle');
            const isActive = target === currentLang;
            btn.classList.toggle('mm-i18n-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function init() {
        applyAll();
        bindToggleControls();
        // Mutation observer: ha az oldal dinamikus markup-t injektal (modal-ok,
        // sidebar render), automatikusan lefordit minden uj `[data-i18n]` elemet.
        try {
            const obs = new MutationObserver((mutations) => {
                let needRefresh = false;
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.matches?.('[data-i18n], [data-i18n-html], [data-i18n-attr]') ||
                                node.querySelector?.('[data-i18n], [data-i18n-html], [data-i18n-attr]')) {
                                needRefresh = true;
                                break;
                            }
                        }
                    }
                    if (needRefresh) break;
                }
                if (needRefresh) applyAll();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (_) { /* ignore */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.MattMesterI18n = {
        t, tx, set, get, applyAll,
        onLangChange, formatDate, formatDateTime,
        syncDatePickerLang,
        SUPPORTED
    };
})();
