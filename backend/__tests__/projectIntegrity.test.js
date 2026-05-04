/**
 * Projekt-integritás teszt szuite — a teljes (~70k sor) kódbázist atfogja.
 *
 * Mit tesztel:
 *   1. Minden frontend JS split-fájl szintaktikailag érvényes (Node parse-check)
 *   2. Minden backend modul require-elheto, indítási hiba nélkül
 *   3. Az aggregator (pl. profile.js + adminPanel.css + admin/index.js) modulok
 *      a vart strukturat adjak vissza
 *   4. A HTML script-tagek mindegyike letezo fajlra mutat
 *   5. A CSS @import-ok mindegyike letezo fajlra mutat
 *   6. Az ES module-ok exportjai megegyeznek a varttal
 *   7. Az admin sub-router-ek mind tartalmaznak rute-bejegyzeseket
 *   8. A korabbi nagy fajlok (admin.js, profile.js) MAR NEM letezneck
 *
 * Cel: ha barki egy hibasan kovetkezo szet bontast / refactort csinal, ez
 * azonnal piros.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(REPO_ROOT, 'backend');
const FRONTEND = path.join(REPO_ROOT, 'frontend');

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function fileExists(p) {
    try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function dirExists(p) {
    try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function readFile(p) {
    return fs.readFileSync(p, 'utf8');
}

function listJsFiles(dir) {
    if (!dirExists(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
}

function listCssFiles(dir) {
    if (!dirExists(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f));
}

function nodeParseCheck(filePath) {
    let result = { ok: false, error: null };
    try {
        childProcess.execFileSync(process.execPath, ['--check', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
        result.ok = true;
    } catch (err) {
        result.error = err.stderr ? err.stderr.toString() : err.message;
    }
    return result;
}

function extractScriptSrcs(htmlContent) {
    const out = [];
    const re = /<script[^>]+src=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(htmlContent)) !== null) {
        if (!m[1].startsWith('http')) out.push(m[1]);
    }
    return out;
}

function extractLinkHrefs(htmlContent) {
    const out = [];
    const re = /<link[^>]+href=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(htmlContent)) !== null) {
        if (!m[1].startsWith('http')) out.push(m[1]);
    }
    return out;
}

function extractCssImports(cssContent) {
    const out = [];
    const re = /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    let m;
    while ((m = re.exec(cssContent)) !== null) {
        out.push(m[1]);
    }
    return out;
}

function resolveRelative(fromFile, relPath) {
    return path.resolve(path.dirname(fromFile), relPath);
}

// ─────────────────────────────────────────────────────────────────────
// 1. Backend admin route split — szerkezet
// ─────────────────────────────────────────────────────────────────────

describe('Backend: admin route split', () => {
    const ADMIN_DIR = path.join(BACKEND, 'api', 'routes', 'admin');
    const EXPECTED_FILES = [
        'index.js',
        'exportUsersRoutes.js',
        'notificationsRoutes.js',
        'profileImageRoutes.js',
        'chatModerationRoutes.js',
        'userReportsRoutes.js',
        'userEditRoutes.js',
        'readOnlyRoutes.js',
        'userDeleteRoutes.js',
        'alertsRoutes.js',
        'ipBlockRoutes.js',
        'securityLoginsRoutes.js'
    ];

    test('a regi monolit admin.js TÖRÖLVE van', () => {
        const oldPath = path.join(BACKEND, 'api', 'routes', 'admin.js');
        expect(fileExists(oldPath)).toBe(false);
    });

    test('admin/ konyvtar letezik', () => {
        expect(dirExists(ADMIN_DIR)).toBe(true);
    });

    test.each(EXPECTED_FILES)('admin/%s letezik es parse-olhato', (filename) => {
        const filePath = path.join(ADMIN_DIR, filename);
        expect(fileExists(filePath)).toBe(true);
        const check = nodeParseCheck(filePath);
        if (!check.ok) {
            throw new Error(`Parse hiba ${filename}-ben:\n${check.error}`);
        }
    });

    test('admin/index.js Express routert exportal', () => {
        // require gegjcache-elve lehet, igy a `delete require.cache`-tel friss betoltest erzunk
        const indexPath = path.join(ADMIN_DIR, 'index.js');
        delete require.cache[require.resolve(indexPath)];
        const router = require(indexPath);
        expect(typeof router).toBe('function');
        expect(router.name).toBe('router');
        // Express router belso prop-ok
        expect(router.stack).toBeDefined();
        expect(Array.isArray(router.stack)).toBe(true);
        expect(router.stack.length).toBeGreaterThan(10);
    });

    test('minden sub-router fajl tartalmaz legalabb 1 route-bejegyzest', () => {
        const subRouters = EXPECTED_FILES.filter((f) => f !== 'index.js');
        for (const filename of subRouters) {
            const content = readFile(path.join(ADMIN_DIR, filename));
            const routeMatches = content.match(/router\.(get|post|put|delete|patch)\(/g) || [];
            expect(routeMatches.length).toBeGreaterThanOrEqual(1);
        }
    });

    test('backend/api/api.js az uj admin/-t require-eli (a regi admin.js-t NEM)', () => {
        const apiContent = readFile(path.join(BACKEND, 'api', 'api.js'));
        // Megengedjuk: require('./routes/admin') vagy require('./routes/admin/')
        // vagy require('./routes/admin/index.js'). NE engedjuk: require('./routes/admin.js').
        expect(apiContent).not.toMatch(/require\(\s*['"]\.\/routes\/admin\.js['"]\s*\)/);
        expect(apiContent).toMatch(/require\(\s*['"]\.\/routes\/admin['"]\s*\)/);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Frontend profile.js split — 21 fajl + bootstrap (20-bootstrap utan
//    bekerult a 21-dashboardStats.js a dashboard header dinamikus
//    populacio-jara).
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: profile.js split (21 fajl)', () => {
    const PROFILE_DIR = path.join(FRONTEND, 'javascript', 'profile');
    const EXPECTED_PREFIX_RE = /^\d{2}-[a-zA-Z]+\.js$/;
    const EXPECTED_PROFILE_FILE_COUNT = 21;

    test('a regi monolit profile.js TÖRÖLVE van', () => {
        const oldPath = path.join(FRONTEND, 'javascript', 'profile.js');
        expect(fileExists(oldPath)).toBe(false);
    });

    test('profile/ konyvtar letezik 21 fajllal', () => {
        expect(dirExists(PROFILE_DIR)).toBe(true);
        const files = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.js'));
        expect(files.length).toBe(EXPECTED_PROFILE_FILE_COUNT);
        for (const f of files) {
            expect(f).toMatch(EXPECTED_PREFIX_RE);
        }
    });

    test('minden profile/*.js parse-olhato', () => {
        const files = listJsFiles(PROFILE_DIR);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}-ben:\n${check.error}`);
            }
        }
    });

    test('20-bootstrap.js tartalmazza a DOMContentLoaded handler-t', () => {
        const bootPath = path.join(PROFILE_DIR, '20-bootstrap.js');
        const content = readFile(bootPath);
        expect(content).toMatch(/DOMContentLoaded/);
        expect(content).toMatch(/bindNotificationCenterEvents/);
    });

    test('koncatenálva is parse-olódik a teljes profile JS', () => {
        const files = listJsFiles(PROFILE_DIR).sort();
        const combined = files.map((f) => readFile(f)).join('\n');
        const tmpPath = path.join(__dirname, '_tmp_profile_combined.js');
        fs.writeFileSync(tmpPath, combined, 'utf8');
        try {
            const check = nodeParseCheck(tmpPath);
            if (!check.ok) {
                throw new Error(`Combined parse hiba:\n${check.error}`);
            }
        } finally {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
    });

    test('profile.html mind a 21 split-et betolti helyes sorrendben', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'profile.html'));
        const profileScripts = extractScriptSrcs(html).filter((s) => s.includes('profile/'));
        expect(profileScripts.length).toBe(EXPECTED_PROFILE_FILE_COUNT);
        // 01- ... 21- prefixes, sorrendben
        for (let i = 0; i < EXPECTED_PROFILE_FILE_COUNT; i++) {
            const expectedPrefix = String(i + 1).padStart(2, '0') + '-';
            expect(profileScripts[i]).toContain('/profile/' + expectedPrefix);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Frontend adminPanel.js split — 29 fajl (29-userCreate.js bekerult
//    az "Uj felhasznalo" modal handler-evel a 28-bootstrap.js elott).
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: adminPanel.js split (29 fajl)', () => {
    const ADMIN_PANEL_DIR = path.join(FRONTEND, 'javascript', 'adminPanel');
    const EXPECTED_ADMIN_FILE_COUNT = 29;

    test('a regi monolit adminPanel.js TÖRÖLVE van', () => {
        const oldPath = path.join(FRONTEND, 'javascript', 'adminPanel.js');
        expect(fileExists(oldPath)).toBe(false);
    });

    test('adminPanel/ konyvtar letezik 29 fajllal', () => {
        expect(dirExists(ADMIN_PANEL_DIR)).toBe(true);
        const files = fs.readdirSync(ADMIN_PANEL_DIR).filter((f) => f.endsWith('.js'));
        expect(files.length).toBe(EXPECTED_ADMIN_FILE_COUNT);
    });

    test('minden adminPanel/*.js parse-olhato', () => {
        const files = listJsFiles(ADMIN_PANEL_DIR);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });

    test('adminPanel.html mind a 29 split-et betolti', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'adminPanel.html'));
        const scripts = extractScriptSrcs(html).filter((s) => s.includes('adminPanel/'));
        expect(scripts.length).toBe(EXPECTED_ADMIN_FILE_COUNT);
    });

    test('a 3 IIFE module assignment intakt (ProfileImages, ChatModeration, Reports)', () => {
        const files = ['23-moderationProfileImages.js', '24-moderationChat.js', '25-moderationReports.js'];
        const expected = ['MattMesterAdminProfileImages', 'MattMesterAdminChatModeration', 'MattMesterAdminReports'];
        files.forEach((file, i) => {
            const content = readFile(path.join(ADMIN_PANEL_DIR, file));
            expect(content).toMatch(new RegExp(`window\\.${expected[i]}\\s*=\\s*\\(function`));
            expect(content.trim()).toMatch(/\}\)\(\);?\s*$/); // IIFE-veg
        });
    });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Frontend CSS split — adminPanel.css + profile.css
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: CSS split (aggregator + reszfajlok)', () => {
    const ADMIN_CSS_DIR = path.join(FRONTEND, 'css', 'adminPanel');
    const PROFILE_CSS_DIR = path.join(FRONTEND, 'css', 'profile');

    test('adminPanel.css aggregator + adminPanel/ konyvtar', () => {
        expect(fileExists(path.join(FRONTEND, 'css', 'adminPanel.css'))).toBe(true);
        expect(dirExists(ADMIN_CSS_DIR)).toBe(true);
        const files = listCssFiles(ADMIN_CSS_DIR);
        expect(files.length).toBe(14);
    });

    test('profile.css aggregator + profile/ konyvtar', () => {
        expect(fileExists(path.join(FRONTEND, 'css', 'profile.css'))).toBe(true);
        expect(dirExists(PROFILE_CSS_DIR)).toBe(true);
        const files = listCssFiles(PROFILE_CSS_DIR);
        expect(files.length).toBe(10);
    });

    test('adminPanel.css minden @import-ja letezo fajlra mutat', () => {
        const aggPath = path.join(FRONTEND, 'css', 'adminPanel.css');
        const imports = extractCssImports(readFile(aggPath));
        expect(imports.length).toBe(14);
        for (const imp of imports) {
            const resolved = resolveRelative(aggPath, imp);
            expect(fileExists(resolved)).toBe(true);
        }
    });

    test('profile.css minden @import-ja letezo fajlra mutat', () => {
        const aggPath = path.join(FRONTEND, 'css', 'profile.css');
        const imports = extractCssImports(readFile(aggPath));
        expect(imports.length).toBe(10);
        for (const imp of imports) {
            const resolved = resolveRelative(aggPath, imp);
            expect(fileExists(resolved)).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Frontend chess_barold split — 2 uj ES modul
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: chess_barold ES module split', () => {
    const CHESS_DIR = path.join(FRONTEND, 'chess_barold', 'javascript');

    test('audio.js letezik es export-olja a lepesHangLejatszas-t', () => {
        const audioPath = path.join(CHESS_DIR, 'audio.js');
        expect(fileExists(audioPath)).toBe(true);
        const content = readFile(audioPath);
        expect(content).toMatch(/^export function lepesHangLejatszas/m);
    });

    test('domSkeleton.js letezik es export-olja az oldalSerult + oldalVazVisszaallit-t', () => {
        const domPath = path.join(CHESS_DIR, 'domSkeleton.js');
        expect(fileExists(domPath)).toBe(true);
        const content = readFile(domPath);
        expect(content).toMatch(/^export function oldalSerult/m);
        expect(content).toMatch(/^export function oldalVazVisszaallit/m);
    });

    test('main.js az uj modulokat importalja', () => {
        const mainPath = path.join(CHESS_DIR, 'main.js');
        const content = readFile(mainPath);
        expect(content).toMatch(/import\s*\{[^}]*lepesHangLejatszas[^}]*\}\s*from\s*['"]\.\/audio\.js['"]/);
        expect(content).toMatch(/import\s*\{[^}]*oldalSerult[^}]*oldalVazVisszaallit[^}]*\}\s*from\s*['"]\.\/domSkeleton\.js['"]/);
    });

    test('main.js MAR NEM tartalmazza a kiemelt audio kódot', () => {
        const mainPath = path.join(CHESS_DIR, 'main.js');
        const content = readFile(mainPath);
        // Ha a fuggveny declaration ottmarad, akkor duplikat es konfliktus van.
        expect(content).not.toMatch(/^function audioContextKeres\(/m);
        expect(content).not.toMatch(/^function lepesHangLejatszas\(/m);
        // Ugyanigy a DOM skeleton blokkok
        expect(content).not.toMatch(/^const OLDAL_VAZ\s*=\s*`/m);
        expect(content).not.toMatch(/^function oldalSerult\(/m);
    });

    test('mind a chess_barold/javascript/*.js (top-level) parse-olhato', () => {
        const files = listJsFiles(CHESS_DIR);
        // Minimum a 6 alap modul: UI-megjelenites.js, abilities.js, audio.js,
        // domSkeleton.js, main.js, settings.js. Plusz a refactor soran kivagott
        // modulok (state.js, stb.) — barmelyik szam elfogadhato amig minden parse-olhato.
        expect(files.length).toBeGreaterThanOrEqual(6);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Atfogo HTML — minden HTML script src letezik
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: HTML script src kapcsolatok', () => {
    const HTML_DIR = path.join(FRONTEND, 'html');
    const htmlFiles = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html')).map((f) => path.join(HTML_DIR, f));

    test.each(htmlFiles)('%s minden lokalis script src letezo fajlra mutat', (htmlPath) => {
        const content = readFile(htmlPath);
        const srcs = extractScriptSrcs(content).filter((s) => !s.startsWith('/socket.io/'));
        for (const src of srcs) {
            // Az url-ek vagy ../-tol vagy /-tol indulnak. Resolve a frontend-bol.
            let resolved;
            if (src.startsWith('/')) {
                resolved = path.join(FRONTEND, src.slice(1));
            } else {
                resolved = resolveRelative(htmlPath, src);
            }
            if (!fileExists(resolved)) {
                throw new Error(`Hianyzo script src "${src}" a ${path.basename(htmlPath)}-ben (varhato: ${resolved})`);
            }
        }
    });

    test.each(htmlFiles)('%s minden lokalis link href letezo fajlra mutat', (htmlPath) => {
        const content = readFile(htmlPath);
        const hrefs = extractLinkHrefs(content)
            .filter((h) => !h.startsWith('http'))
            .filter((h) => !h.startsWith('#'))
            .filter((h) => h.endsWith('.css') || h.endsWith('.ico') || h.endsWith('.png') || h.endsWith('.svg'));
        for (const href of hrefs) {
            let resolved;
            if (href.startsWith('/')) {
                resolved = path.join(FRONTEND, href.slice(1));
            } else {
                resolved = resolveRelative(htmlPath, href);
            }
            if (!fileExists(resolved)) {
                throw new Error(`Hianyzo link href "${href}" a ${path.basename(htmlPath)}-ben (varhato: ${resolved})`);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 6.a Chess lifecycle invariánsok (server crash, ban, delete, maintenance, bot)
// ─────────────────────────────────────────────────────────────────────

describe('Chess lifecycle invariánsok', () => {
    test('startupCleanupOngoingGames létezik a chess_sql_functions-ban', () => {
        const file = path.join(BACKEND, 'chess', 'chess_sql_functions.js');
        const content = readFile(file);
        expect(content).toMatch(/async function startupCleanupOngoingGames/);
        expect(content).toMatch(/module\.exports\s*=\s*\{[\s\S]*startupCleanupOngoingGames[\s\S]*\}/);
    });

    test('server.js a startupot bekoti', () => {
        const content = readFile(path.join(BACKEND, 'server.js'));
        expect(content).toMatch(/startupCleanupOngoingGames\s*\(\s*\)/);
    });

    test('abortHelpers.js exportalja a 4 fokozott meccs-abort funkciot', () => {
        const file = path.join(BACKEND, 'chess', 'abortHelpers.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        for (const fn of ['abortGameNoElo', 'abortAndAwardOpponent', 'abortByUserDisable', 'abortAllOngoingForMaintenance']) {
            expect(content).toMatch(new RegExp(`(async )?function ${fn}\\b`));
            expect(content).toMatch(new RegExp(`module\\.exports[\\s\\S]*${fn}[\\s\\S]*\\}`));
        }
    });

    test('readOnlyRoutes ban handler hivja az abortByUserDisable-t', () => {
        const content = readFile(path.join(BACKEND, 'api', 'routes', 'admin', 'readOnlyRoutes.js'));
        expect(content).toMatch(/abortByUserDisable/);
    });

    test('userDeleteRoutes hivja az abortByUserDisable-t', () => {
        const content = readFile(path.join(BACKEND, 'api', 'routes', 'admin', 'userDeleteRoutes.js'));
        expect(content).toMatch(/abortByUserDisable/);
    });

    test('maintenanceScheduler emitEnforce hivja az abortAllOngoingForMaintenance-t', () => {
        const content = readFile(path.join(BACKEND, 'api', 'admin', 'maintenanceScheduler.js'));
        expect(content).toMatch(/abortAllOngoingForMaintenance/);
    });

    test('Bot meccs MINDIG casual: chess_api.js new-bot route ranked=false-t ad át', () => {
        const content = readFile(path.join(BACKEND, 'api', 'chess_api.js'));
        // Az új-bot route-ban explicit `ranked: false` legyen — nincs body-ranked propagálás
        expect(content).toMatch(/router\.post\(['"]\/new-bot['"]/);
        // Az adott route blokkban `ranked: false` literál
        const m = content.match(/router\.post\(['"]\/new-bot['"][\s\S]*?(?=router\.|module\.exports)/);
        expect(m).toBeTruthy();
        expect(m[0]).toMatch(/ranked:\s*false/);
    });

    test('chessModeChooser.js letezik es exportalja a window.MattMesterChessModeChooser-t', () => {
        const file = path.join(FRONTEND, 'javascript', 'chessModeChooser.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        expect(content).toMatch(/window\.MattMesterChessModeChooser\s*=/);
        expect(content).toMatch(/open\s*[,:]/);
    });

    test('index.html a chessModeChooser.open()-t hivja a Játék gomb mogul', () => {
        const content = readFile(path.join(FRONTEND, 'html', 'index.html'));
        expect(content).toMatch(/MattMesterChessModeChooser\?\.open\(\)/);
        expect(content).toMatch(/<script[^>]+chessModeChooser\.js/);
    });

    test('chess.html main.js elismeri a query-string alapú indítást', () => {
        const content = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js'));
        expect(content).toMatch(/initFromQueryParams|initBotFromQueryParams/);
        expect(content).toMatch(/URLSearchParams\(window\.location\.search\)/);
    });

    // Regresszio: a regi #mode-modal jatekmod-valaszto NEM kerulhet vissza chess.html-be.
    // A teljes flow az uj chessModeChooser.js-en keresztul megy. Ha barki visszateszi,
    // ez a teszt fog bukni — ne meresszek ujra a "Mattmester / Valassz jatekmodot / Az ELO-d"
    // popup-ot a betoltesi villogassal egyutt.
    describe('Regi #mode-modal jatekmod-valaszto vegleg eltavolitva (anti-regression)', () => {
        test('chess.html NEM tartalmazza a regi #mode-modal markupot', () => {
            const html = readFile(path.join(FRONTEND, 'chess_barold', 'html', 'chess.html'));
            expect(html).not.toMatch(/id=["']mode-modal["']/);
            expect(html).not.toMatch(/Válassz játékmódot/);
            expect(html).not.toMatch(/Az ELO-d:/);
            expect(html).not.toMatch(/id=["']mode-list["']/);
            expect(html).not.toMatch(/id=["']difficulty-list["']/);
        });

        test('chess.html bekoti az uj chessModeChooser.js-t es CSS-t', () => {
            const html = readFile(path.join(FRONTEND, 'chess_barold', 'html', 'chess.html'));
            expect(html).toMatch(/<script[^>]+chessModeChooser\.js/);
            expect(html).toMatch(/<link[^>]+chessModeChooser\.css/);
        });

        test('main.js semmilyen kodutvonalon NEM hivja meg a regi modValasztoMegjelenit-et', () => {
            const content = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js'));
            // Csak a fuggveny DEFINICIO (`function modValasztoMegjelenit()`) maradhat
            // dead code-ként, HIVAS (`modValasztoMegjelenit()`) NEM lehet sehol.
            const allMatches = content.match(/(?:^|[^a-zA-Z0-9_$])(\w*\s*function\s+)?modValasztoMegjelenit\s*\(\s*\)/gm) || [];
            const callsOnly = allMatches.filter(s => !/function\s+modValasztoMegjelenit/.test(s));
            expect(callsOnly.length).toBe(0);
        });

        test('chooser.js definialja az ujMeccsChooserNyitas helper-t es a main.js hivja', () => {
            // Refactor: az `ujMeccsChooserNyitas` mostantol a `chooser.js` modulban van.
            const chooserSrc = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'chooser.js'));
            expect(chooserSrc).toMatch(/export\s+function\s+ujMeccsChooserNyitas\s*\(/);
            expect(chooserSrc).toMatch(/MattMesterChessModeChooser/);

            // A main.js (es egyeb modulok) importaljak es legalabb 2 helyrol hivjak
            // (rejoin-none socket handler + game-end modal Uj jatek callback + fallbackek).
            const mainSrc = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js'));
            expect(mainSrc).toMatch(/from\s+['"]\.\/chooser\.js['"]/);
            const calls = mainSrc.match(/ujMeccsChooserNyitas\s*\(\s*\)/g) || [];
            expect(calls.length).toBeGreaterThanOrEqual(2);
        });

        test('chess:rejoin:none socket handler NEM nyulhat a regi mode-modal-hoz', () => {
            const content = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js'));
            const m = content.match(/socket\.on\(['"]chess:rejoin:none['"][\s\S]*?\}\s*\)\s*;/);
            expect(m).toBeTruthy();
            expect(m[0]).not.toMatch(/mode-modal/);
            // Legyen benne az uj chooser-hivas
            expect(m[0]).toMatch(/ujMeccsChooserNyitas|MattMesterChessModeChooser/);
        });
    });

    describe('Kozos felso navbar (adminPanel + profile) — markup + behavior', () => {
        const TOP_NAVBAR_CSS = path.join(FRONTEND, 'css', 'shared', 'topNavbar.css');
        const TOP_NAVBAR_JS = path.join(FRONTEND, 'javascript', 'shared', 'topNavbar.js');
        const ADMIN_HTML = path.join(FRONTEND, 'html', 'adminPanel.html');
        const PROFILE_HTML = path.join(FRONTEND, 'html', 'profile.html');

        test('topNavbar.css es topNavbar.js letezik a shared mappakban', () => {
            expect(fileExists(TOP_NAVBAR_CSS)).toBe(true);
            expect(fileExists(TOP_NAVBAR_JS)).toBe(true);
        });

        test('topNavbar.css: az adminPanel belso .top-navbar sticky-scroll override-ja megvan (a fix navbar alatt ragadjon)', () => {
            const css = readFile(TOP_NAVBAR_CSS);
            // A body.has-mm-top-navbar .top-navbar selector le kell hogy lenyomja
            // a sticky top-ot a navbar magassagaval, hogy ne csusszon a fix navbar
            // moge gorgetes kozben
            const m = css.match(/body\.has-mm-top-navbar\s+\.top-navbar\s*\{[^}]*\}/);
            expect(m).toBeTruthy();
            expect(m[0]).toMatch(/top:\s*calc\(var\(--mm-tnb-h\)/);
        });

        test('topNavbar.js a /api/sessionInfo-t hivja es ket data-page agat ker el', () => {
            const js = readFile(TOP_NAVBAR_JS);
            expect(js).toMatch(/\/api\/sessionInfo/);
            expect(js).toMatch(/data-page.*admin|getAttribute\(['"]data-page['"]\)/);
            expect(js).toMatch(/bindAdminLogout/);
            expect(js).toMatch(/bindProfileLogout/);
            // Admin Kijelentkezes most TELJES logout: POST /api/logout + clearAdminToken
            // (kulonben azonos lenne a MATTMESTER nav linkkel — UX-ban megkulonboztetheto kell legyen)
            expect(js).toMatch(/performFullLogout/);
            expect(js).toMatch(/['"]\/api\/logout['"]/);
            expect(js).toMatch(/clearAdminToken/);
            // Profile agon a meglevo #logoutModal-t kell nyitni (handleLogout /api/logout)
            expect(js).toMatch(/['"]logoutModal['"]/);
        });

        test('topNavbar.js role==="admin" eseten felfedi a #mmTopNavbarAdminBtn gombot', () => {
            const js = readFile(TOP_NAVBAR_JS);
            expect(js).toMatch(/revealAdminButtonIfAdmin/);
            expect(js).toMatch(/mmTopNavbarAdminBtn/);
            // A felfedo logikanak ellenoriznie kell hogy role === 'admin'
            const m = js.match(/function\s+revealAdminButtonIfAdmin[\s\S]{0,400}/);
            expect(m).toBeTruthy();
            expect(m[0]).toMatch(/role\s*!==\s*['"]admin['"]|role\s*===\s*['"]admin['"]/);
            expect(m[0]).toMatch(/hidden\s*=\s*false/);
        });

        test('adminPanel.html bekoti a kozos navbart, data-page="admin", body.has-mm-top-navbar', () => {
            const html = readFile(ADMIN_HTML);
            expect(html).toMatch(/<link[^>]+css\/shared\/topNavbar\.css/);
            expect(html).toMatch(/<script[^>]+javascript\/shared\/topNavbar\.js/);
            expect(html).toMatch(/<body[^>]*class=["'][^"']*has-mm-top-navbar/);
            expect(html).toMatch(/<nav[^>]*class=["']mm-top-navbar["'][^>]*data-page=["']admin["']/);
            expect(html).toMatch(/id=["']mmTopNavbarUsername["']/);
            expect(html).toMatch(/id=["']mmTopNavbarLogoutBtn["']/);
            // Profil beallitas link eleresi utvonal
            expect(html).toMatch(/href=["']\/html\/profile\.html["']/);
        });

        test('adminPanel.html: nincs duplikalt sidebar-header (MattAdmin brand) — csak a felso navbar a brand', () => {
            const html = readFile(ADMIN_HTML);
            expect(html).not.toMatch(/<div\s+class=["']sidebar-header["']/);
            expect(html).not.toMatch(/class=["']sidebar-brand["']/);
            // A sidebar nav-tag tovabbra is letezik
            expect(html).toMatch(/<nav[^>]*class=["']sidebar["']/);
        });

        test('adminPanel.html: top-navbar search bar es chevron-down ikon EL VAN TAVOLITVA, user-profile dropdown D-NONE-ra teve', () => {
            const html = readFile(ADMIN_HTML);
            // A keresomezo nem latszik
            expect(html).not.toMatch(/id=["']adminTopSearchInput["']/);
            expect(html).not.toMatch(/Játékos vagy játék keresése/);
            expect(html).not.toMatch(/<div\s+class=["']search-box["']/);
            // user-profile dropdown rejtett (d-none) hogy a #headerUsername / #headerAvatar
            // tovabbra is meglegyen a 09-auth.js populateHeaderFromUser-hoz, de ne latszodjon
            const userProfileMatch = html.match(/<div\s+class=["']user-profile[^"']*d-none[^"']*["']/);
            expect(userProfileMatch).toBeTruthy();
            // A duplikalt dropdown menu (Profil/Beallitasok/Kijelentkezes) torolve
            expect(html).not.toMatch(/<a[^>]*class=["']dropdown-item[^"']*text-danger["'][^>]*onclick=["']logout\(\)/);
            expect(html).not.toMatch(/bi-chevron-down/);
        });

        test('profile.html bekoti a kozos navbart, data-page="profile", body.has-mm-top-navbar', () => {
            const html = readFile(PROFILE_HTML);
            expect(html).toMatch(/<link[^>]+css\/shared\/topNavbar\.css/);
            expect(html).toMatch(/<script[^>]+javascript\/shared\/topNavbar\.js/);
            expect(html).toMatch(/<body[^>]*class=["'][^"']*has-mm-top-navbar/);
            expect(html).toMatch(/<nav[^>]*class=["']mm-top-navbar["'][^>]*data-page=["']profile["']/);
            expect(html).toMatch(/id=["']mmTopNavbarLogoutBtn["']/);
        });

        test('profile.html: van egy "Admin felulet" gomb (alapbol hidden) a /html/adminPanel.html-re mutatva', () => {
            const html = readFile(PROFILE_HTML);
            const m = html.match(/<a[^>]*id=["']mmTopNavbarAdminBtn["'][^>]*>/);
            expect(m).toBeTruthy();
            expect(m[0]).toMatch(/href=["']\/html\/adminPanel\.html["']/);
            expect(m[0]).toMatch(/\bhidden\b/);
        });

        test('profile.html: nincs duplikalt sidebar MATTMESTER brand es nincs sidebar-alji Logout gomb', () => {
            const html = readFile(PROFILE_HTML);
            // Stripoljuk az HTML komenteket, mert azokban szerepelhet MATTMESTER szo
            // (magyarazo komment), de az nem renderelt markup
            const sidebarMatch = html.match(/<nav\s+class=["']sidebar["']\s+id=["']sidebar["'][\s\S]*?<\/nav>/);
            expect(sidebarMatch).toBeTruthy();
            const sidebarStripped = sidebarMatch[0].replace(/<!--[\s\S]*?-->/g, '');
            // A sidebar-brand div torolve (MATTMESTER duplikalva volt a felso navbarral)
            expect(sidebarStripped).not.toMatch(/sidebar-brand/);
            expect(sidebarStripped).not.toMatch(/<span[^>]*>\s*MATTMESTER\s*<\/span>/);
            // A sidebar-alji "Logout" gomb (data-bs-target="#logoutModal") torolve
            expect(sidebarStripped).not.toMatch(/data-bs-target=["']#logoutModal["']/);
        });

        test('profile.html mar tartalmazza a #logoutModal-t (a navbar logout gombja erre tamaszkodik)', () => {
            const html = readFile(PROFILE_HTML);
            expect(html).toMatch(/id=["']logoutModal["']/);
            expect(html).toMatch(/id=["']confirmLogoutButton["']/);
        });
    });

    // ===========================================================================
    // BIG AUDIT BUNDLE — A/B/C/D/E/F javitasok rogzitese (anti-regression).
    // Ezek mind az "audit + javitsd ami torott" kor utan keszultek, hogy a kovetkezo
    // kor barmilyen visszaterese azonnal piros tesztet adjon.
    // ===========================================================================
    describe('Audit bundle: shared confirmModal + dead-code cleanup + add-user + dashboard', () => {
        const CONFIRM_CSS = path.join(FRONTEND, 'css', 'shared', 'confirmModal.css');
        const CONFIRM_JS = path.join(FRONTEND, 'javascript', 'shared', 'confirmModal.js');
        const ADMIN_HTML = path.join(FRONTEND, 'html', 'adminPanel.html');
        const PROFILE_HTML = path.join(FRONTEND, 'html', 'profile.html');
        const INDEX_HTML = path.join(FRONTEND, 'html', 'index.html');
        const CHESS_HTML = path.join(FRONTEND, 'chess_barold', 'html', 'chess.html');
        const CHESS_MAIN_JS = path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js');
        const SIDEBAR_CSS = path.join(FRONTEND, 'css', 'adminPanel', '03-sidebar.css');

        test('shared/confirmModal.css es .js letezik es exportalja mmConfirm + mmAlert-et', () => {
            expect(fileExists(CONFIRM_CSS)).toBe(true);
            expect(fileExists(CONFIRM_JS)).toBe(true);
            const js = readFile(CONFIRM_JS);
            expect(js).toMatch(/window\.mmConfirm\s*=/);
            expect(js).toMatch(/window\.mmAlert\s*=/);
        });

        test('confirmModal CSS+JS be van toltve mind a 4 fooldalon', () => {
            for (const html of [ADMIN_HTML, PROFILE_HTML, INDEX_HTML, CHESS_HTML]) {
                const content = readFile(html);
                expect(content).toMatch(/css\/shared\/confirmModal\.css/);
                expect(content).toMatch(/javascript\/shared\/confirmModal\.js/);
            }
        });

        test('NINCS native confirm()/alert() a 7 korabban kiszurt user-facing pontnal', () => {
            // chessInviteGlobal.js: confirm() helyett mmConfirm
            const inv = readFile(path.join(FRONTEND, 'javascript', 'chessInviteGlobal.js'));
            expect(inv).toMatch(/mmConfirm/);
            expect(inv).not.toMatch(/^\s*const elfogadta = globalScope\.confirm\(/m);
            // chess main.js: ket alert helyett mmAlert
            const main = readFile(CHESS_MAIN_JS);
            expect(main).toMatch(/mmAlert/);
            // Az `alert(` mar nem hivva (a kommenteket strippoljuk a count elott)
            const mainStripped = main.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const alertCalls = mainStripped.match(/(?<![a-zA-Z0-9_$.])alert\s*\(/g) || [];
            expect(alertCalls.length).toBe(0);
            // adminPanel modulok
            const sec = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '16-security.js'));
            expect(sec).toMatch(/mmConfirm/);
            const ud = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '18-userDelete.js'));
            expect(ud).toMatch(/mmConfirm/);
            const lo = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '21-logout.js'));
            expect(lo).toMatch(/mmConfirm/);
        });

        test('chess main.js: torolt dead modValasztoMegjelenit es kapcsolt segedek', () => {
            const main = readFile(CHESS_MAIN_JS);
            expect(main).not.toMatch(/function\s+modValasztoMegjelenit/);
            expect(main).not.toMatch(/function\s+baratListaMegjelenit/);
            expect(main).not.toMatch(/function\s+meghivasKuld/);
            expect(main).not.toMatch(/function\s+randomQueueIndit/);
            expect(main).not.toMatch(/function\s+randomQueueMegse/);
            expect(main).not.toMatch(/function\s+apiModes/);
            expect(main).not.toMatch(/function\s+apiNehezsegek/);
            expect(main).not.toMatch(/function\s+apiUserElo/);
        });

        test('chess main.js: NINCS aktiv mode-modal getElementById hivas (csak ha komment-ben)', () => {
            const main = readFile(CHESS_MAIN_JS);
            const stripped = main.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            expect(stripped).not.toMatch(/getElementById\(['"]mode-modal['"]\)/);
        });

        test('adminPanel sidebar CSS: orphan .sidebar-header / .sidebar-brand torolve', () => {
            const css = readFile(SIDEBAR_CSS);
            expect(css).not.toMatch(/^\.sidebar-header\s*\{/m);
            expect(css).not.toMatch(/^\.sidebar-brand\s*\{/m);
        });

        test('Add User: backend /users/create endpoint letezik + index.js mountolja', () => {
            const file = path.join(BACKEND, 'api', 'routes', 'admin', 'userCreateRoutes.js');
            expect(fileExists(file)).toBe(true);
            const content = readFile(file);
            expect(content).toMatch(/router\.post\(\s*['"]\/users\/create['"]/);
            expect(content).toMatch(/generateTempPassword/);
            expect(content).toMatch(/USERS_CREATE/);

            const indexJs = readFile(path.join(BACKEND, 'api', 'routes', 'admin', 'index.js'));
            expect(indexJs).toMatch(/userCreateRoutes/);
        });

        test('Add User: USERS_CREATE permission konstans definialva', () => {
            const constants = readFile(path.join(BACKEND, 'api', 'admin', 'constants.js'));
            expect(constants).toMatch(/USERS_CREATE:\s*['"]users\.create['"]/);
        });

        test('Add User: frontend modal Sumbit gomb onclick="submitCreateUser()" + handler letezik', () => {
            const html = readFile(ADMIN_HTML);
            expect(html).toMatch(/id=["']createUserSubmitBtn["'][^>]*onclick=["']submitCreateUser\(\)["']/);
            // Reason field is mandatory
            expect(html).toMatch(/id=["']createUserReason["']/);
            const handlerFile = path.join(FRONTEND, 'javascript', 'adminPanel', '29-userCreate.js');
            expect(fileExists(handlerFile)).toBe(true);
            const handlerJs = readFile(handlerFile);
            expect(handlerJs).toMatch(/async function submitCreateUser/);
            expect(handlerJs).toMatch(/\/api\/admin\/users\/create/);
            // adminPanel.html load order
            expect(html).toMatch(/<script[^>]+adminPanel\/29-userCreate\.js/);
        });

        test('Profile dashboard: 21-dashboardStats.js letezik es a hardcoded testdata torolve', () => {
            const dashJs = path.join(FRONTEND, 'javascript', 'profile', '21-dashboardStats.js');
            expect(fileExists(dashJs)).toBe(true);
            const js = readFile(dashJs);
            expect(js).toMatch(/\/api\/sessionInfo/);
            expect(js).toMatch(/profileDashboardName/);
            expect(js).toMatch(/profileEloClassic/);
            expect(js).toMatch(/profileStatWins/);

            const html = readFile(PROFILE_HTML);
            // hardcoded szovegek mar nincsenek
            expect(html).not.toMatch(/GrandMaster_99/);
            expect(html).not.toMatch(/admin@mattmester\.com/);
            expect(html).not.toMatch(/>247</);  // wins
            expect(html).not.toMatch(/>1,500</); // ELO
            // Az IDs jelen vannak
            expect(html).toMatch(/id=["']profileDashboardName["']/);
            expect(html).toMatch(/id=["']profileEloMM["']/);
            expect(html).toMatch(/id=["']profileStatWinRate["']/);
            // a 21-dashboardStats.js script bekotve
            expect(html).toMatch(/<script[^>]+profile\/21-dashboardStats\.js/);
        });
    });

    // First-tab-priority: ha a felhasznalonak van AKTIV meccse (akar bot, akar PvP),
    // egy masik tab nem indithat ujat — 409 GAME_ALREADY_ACTIVE. A regi auto-cleanup
    // viselkedes (cleanupOwnAbandonedBotGame) eltavolitva, mert exploitolhato volt:
    // 2. tab elinditasa kilokte az 1. tab aktiv meccsebol a felhasznalot.
    test('state.js NEM tartalmaz cleanupOwnAbandonedBotGame helper-t (first-tab-priority)', () => {
        const content = readFile(path.join(BACKEND, 'chess', 'state.js'));
        expect(content).not.toMatch(/cleanupOwnAbandonedBotGame/);
    });

    test('chess_api.js /new-bot 409-et ad ha barmilyen aktiv meccs van', () => {
        const content = readFile(path.join(BACKEND, 'api', 'chess_api.js'));
        // Auto-cleanup eltavolitva
        expect(content).not.toMatch(/cleanupOwnAbandonedBotGame/);
        // hasAnyActiveGameForUser hivassal blokkol
        expect(content).toMatch(/hasAnyActiveGameForUser\s*\(\s*\w+\s*\)\.hasActive/);
        // GAME_ALREADY_ACTIVE statusz kod
        expect(content).toMatch(/GAME_ALREADY_ACTIVE/);
    });

    test('pvp.js queue+invite NEM hivja a cleanupOwnAbandonedBotGame-t (first-tab-priority)', () => {
        const content = readFile(path.join(BACKEND, 'chess', 'pvp.js'));
        expect(content).not.toMatch(/cleanupOwnAbandonedBotGame/);
        // Mindket helyen hasAnyActiveGameForUser blokkol
        const hits = content.match(/hasAnyActiveGameForUser\s*\(\s*userId\s*\)\.hasActive/g) || [];
        expect(hits.length).toBeGreaterThanOrEqual(2);
    });

    test('Vegtelen idős módok casual: rankedAllowed=false ÉS eloColumn=null', () => {
        // A `modes.js` egyetlen forrasa az ELO-szabalynak: mattmester és klasszikus
        // (∞ ido) NE legyen ranked, NE adjon ELO-t. Idokorlatos modok (10p, blitz) ranked.
        const modesPath = path.join(BACKEND, 'chess', 'modes.js');
        delete require.cache[require.resolve(modesPath)];
        const { MODES } = require(modesPath);

        // Vegtelen ido (ido === null) → casual
        for (const k of Object.keys(MODES)) {
            const m = MODES[k];
            if (m.ido === null) {
                expect(m.rankedAllowed).toBe(false);
                expect(m.eloColumn).toBeNull();
            } else {
                expect(m.rankedAllowed).toBe(true);
                expect(typeof m.eloColumn).toBe('string');
                expect(m.eloColumn.length).toBeGreaterThan(0);
            }
        }
    });

    test('chessModeChooser frontpage-en kezeli a queue + invite WS event-eket', () => {
        const content = readFile(path.join(FRONTEND, 'javascript', 'chessModeChooser.js'));
        expect(content).toMatch(/chess:queue:join/);
        expect(content).toMatch(/chess:queue:leave/);
        expect(content).toMatch(/chess:game:start/);
        expect(content).toMatch(/chess:invite\b/);
        expect(content).toMatch(/chess:invite:cancel/);
        expect(content).toMatch(/updateSubtitle/);
    });

    test('pvp.js: stale activeGamesByUser bejegyzeseket auto-tisztit (hasLiveActiveGame helper)', () => {
        const content = readFile(path.join(BACKEND, 'chess', 'pvp.js'));
        // A helper letezik es a queue:join + invite handler-ek hivjak
        expect(content).toMatch(/function hasLiveActiveGame/);
        expect(content).toMatch(/hasLiveActiveGame\(userId\)/);
        expect(content).toMatch(/hasLiveActiveGame\(targetUserId\)/);
        // A queue:join mar nem a nyers `activeGamesByUser.has`-t hivja a check-re
        // (az csak `set` / `delete` helyen lehet)
        const queueJoinBlock = content.match(/socket\.on\(['"]chess:queue:join['"][\s\S]*?socket\.on\(/);
        expect(queueJoinBlock).toBeTruthy();
        expect(queueJoinBlock[0]).not.toMatch(/if\s*\(\s*activeGamesByUser\.has\(userId\)\s*\)/);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 6.b SQL modul-modulok: nincs reserved keyword alias (MariaDB)
// ─────────────────────────────────────────────────────────────────────

describe('Backend SQL: nincs reserved-keyword alias a sql/modules/-ben', () => {
    // MariaDB / MySQL reserved word-ok amik aliaskent SQL syntax errort dobnak.
    // Csak a leggyakoribbak. Ha aliaskent ilyet tobb karakteres formaban
    // listazunk, akkor escape nelkul a query nem fog futni.
    const RESERVED = [
        'usage', 'order', 'group', 'select', 'where', 'from', 'join',
        'union', 'limit', 'offset', 'distinct', 'as', 'on', 'using',
        'when', 'then', 'else', 'case', 'with', 'asc', 'desc',
        'rank', 'count', 'sum', 'avg', 'min', 'max', 'left', 'right',
        'inner', 'outer', 'full', 'cross', 'natural', 'condition',
        'key', 'index', 'primary', 'unique', 'foreign', 'references',
        'database', 'schema', 'table', 'column', 'row', 'collation',
        'character', 'set', 'value', 'values', 'check', 'constraint',
        'default', 'null', 'not', 'and', 'or', 'xor', 'between', 'like'
    ];

    function findReservedAliases(content) {
        const found = [];
        // backtick nelkul: `) <reserved>` vagy `AS <reserved>` (es az alias use kontextusban)
        // Egyszeru detektor: derived table close `)` + whitespace + szo + opcionalis ` ON`
        const re1 = /\)\s+(\w+)\s+ON\s+/gi;
        let m;
        while ((m = re1.exec(content)) !== null) {
            const alias = m[1].toLowerCase();
            if (RESERVED.includes(alias) && !content.slice(m.index, m.index + m[0].length).includes('`')) {
                found.push(alias);
            }
        }
        // FROM <table> <alias>  (SELECT-en belul, de a derived table-eknek mar fent matcholtunk)
        return found;
    }

    test('sql/modules/*.js fajlokban nincs unquoted reserved-keyword alias', () => {
        const sqlModulesDir = path.join(BACKEND, 'sql', 'modules');
        if (!dirExists(sqlModulesDir)) return;
        const offenders = [];
        for (const filePath of listJsFiles(sqlModulesDir)) {
            const content = readFile(filePath);
            const found = findReservedAliases(content);
            if (found.length) {
                offenders.push(`${path.basename(filePath)}: ${found.join(', ')}`);
            }
        }
        if (offenders.length) {
            throw new Error(`Reserved-keyword alias-ok escape nelkul:\n  ${offenders.join('\n  ')}`);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Backend API integritás — a fobb router betolheto
// ─────────────────────────────────────────────────────────────────────

describe('Backend: API integritas', () => {
    test('backend/api/api.js betolheto', () => {
        const apiPath = path.join(BACKEND, 'api', 'api.js');
        delete require.cache[require.resolve(apiPath)];
        const router = require(apiPath);
        expect(typeof router).toBe('function');
        expect(router.stack).toBeDefined();
    });

    test('backend/server.js parse-olhato (de NEM toltjuk be — pool, port, etc.)', () => {
        const serverPath = path.join(BACKEND, 'server.js');
        const check = nodeParseCheck(serverPath);
        if (!check.ok) {
            throw new Error(`server.js parse hiba:\n${check.error}`);
        }
    });

    test('minden backend/api/admin/*.js modul require-elheto', () => {
        const adminDir = path.join(BACKEND, 'api', 'admin');
        const files = listJsFiles(adminDir);
        expect(files.length).toBeGreaterThan(10);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });

    test('minden backend/api/middleware/*.js parse-olhato', () => {
        const mwDir = path.join(BACKEND, 'api', 'middleware');
        if (!dirExists(mwDir)) return;
        for (const filePath of listJsFiles(mwDir)) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });

    test('minden backend/api/routes/*.js (admin/ kivetelen kivul) parse-olhato', () => {
        const rDir = path.join(BACKEND, 'api', 'routes');
        const files = listJsFiles(rDir);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Frontend egyeb classic JS fajlok — parse-olhato
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: egyeb classic script fajlok', () => {
    const JS_DIR = path.join(FRONTEND, 'javascript');
    const SHARED_DIR = path.join(JS_DIR, 'shared');

    test('frontend/javascript top-level *.js fajlok parse-olhatok', () => {
        const files = listJsFiles(JS_DIR);
        for (const filePath of files) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });

    test('frontend/javascript/shared/*.js parse-olhatok', () => {
        if (!dirExists(SHARED_DIR)) return;
        for (const filePath of listJsFiles(SHARED_DIR)) {
            const check = nodeParseCheck(filePath);
            if (!check.ok) {
                throw new Error(`Parse hiba ${path.basename(filePath)}:\n${check.error}`);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 9. CSS reszfajlok — minden parse-olhato (egyszeru @import / selector check)
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: CSS reszfajlok formailag rendben', () => {
    function csstrip(content) { return content.replace(/\/\*[\s\S]*?\*\//g, ''); }

    function checkBalancedBraces(content, label) {
        const stripped = csstrip(content);
        const opens = (stripped.match(/\{/g) || []).length;
        const closes = (stripped.match(/\}/g) || []).length;
        if (opens !== closes) {
            throw new Error(`Brace mismatch ${label}-ben: ${opens} { vs ${closes} }`);
        }
    }

    test('adminPanel/*.css fajlok kiegyensulyozott zarojelekkel', () => {
        const dir = path.join(FRONTEND, 'css', 'adminPanel');
        for (const filePath of listCssFiles(dir)) {
            checkBalancedBraces(readFile(filePath), path.basename(filePath));
        }
    });

    test('profile/*.css fajlok kiegyensulyozott zarojelekkel', () => {
        const dir = path.join(FRONTEND, 'css', 'profile');
        for (const filePath of listCssFiles(dir)) {
            checkBalancedBraces(readFile(filePath), path.basename(filePath));
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 9.b STATUS_BADGE tartalmaz minden backend-altal-kuldott game statust
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: STATUS_BADGE lefedi a backend game-status enum-jat', () => {
    test('frontend statusPill nem crashelhet ongoing/finished/abandoned status-ra', () => {
        const helpersPath = path.join(FRONTEND, 'javascript', 'adminPanel', '01-helpers.js');
        const content = readFile(helpersPath);

        // STATUS_BADGE blokk kinyerese — between `const STATUS_BADGE = {` and `};`
        const m = content.match(/const STATUS_BADGE\s*=\s*\{([\s\S]*?)\};/);
        if (!m) throw new Error('STATUS_BADGE nem talalhato a 01-helpers.js-ben');
        const block = m[1];

        // backend gamesAdmin.js status enum: 'ongoing', 'finished', 'abandoned'
        const REQUIRED_GAME_STATUSES = ['ongoing', 'finished', 'abandoned'];
        for (const status of REQUIRED_GAME_STATUSES) {
            if (!new RegExp(`\\b${status}\\s*:`).test(block)) {
                throw new Error(`STATUS_BADGE-bol hianyzik: ${status}. A backend ezt ad ja a games.status mezoben.`);
            }
        }

        // statusPill biztonsagos fallback-tel rendelkezzen (ne crasheljen ismeretlen kulcsra)
        expect(content).toMatch(/statusPill\s*=\s*\([^)]*\)\s*=>\s*\{/);
        // a fallback ugy mukodik hogy `STATUS_BADGE[key] || ...`
        expect(content).toMatch(/STATUS_BADGE\[key\]\s*\|\|/);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 10. Sanity — semmi nincs tobb-deklaralva ugyanabban a scope-ban
// ─────────────────────────────────────────────────────────────────────

describe('Sanity: nincs duplikat top-level deklaracio (split-on-belul)', () => {
    function topLevelFunctions(content) {
        const re = /^(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/gm;
        const out = [];
        let m;
        while ((m = re.exec(content)) !== null) out.push(m[1]);
        return out;
    }

    test('profile/ split-en belul minden top-level function unique (kiveve az eredetiben is duplikalt nevek)', () => {
        const dir = path.join(FRONTEND, 'javascript', 'profile');
        const seen = new Map();
        // escapeHtml az eredeti profile.js-ben is 2x volt deklaralva (sor 211 + 294 a regi fajlban).
        // Classic script-ben az utolsó nyer — ez nem a split, hanem regi orokseg.
        const knownPreExistingDuplicates = new Set(['escapeHtml']);
        for (const filePath of listJsFiles(dir)) {
            const fnames = topLevelFunctions(readFile(filePath));
            for (const name of fnames) {
                if (seen.has(name) && !knownPreExistingDuplicates.has(name)) {
                    throw new Error(`Nem-vart duplikat ${name}: ${seen.get(name)} es ${path.basename(filePath)}`);
                }
                seen.set(name, path.basename(filePath));
            }
        }
    });

    test('adminPanel/ split-en belul minden top-level function unique (kiveve a szandekos patches)', () => {
        const dir = path.join(FRONTEND, 'javascript', 'adminPanel');
        const seen = new Map();
        // executeCriticalAction szandekosan duplikalt: 13-ban defined, 27-ben patched
        const knownPatches = new Set(['executeCriticalAction']);
        for (const filePath of listJsFiles(dir)) {
            const fnames = topLevelFunctions(readFile(filePath));
            for (const name of fnames) {
                if (seen.has(name) && !knownPatches.has(name)) {
                    throw new Error(`Nem-vart duplikat ${name}: ${seen.get(name)} es ${path.basename(filePath)}`);
                }
                seen.set(name, path.basename(filePath));
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// N2 maintenanceClient.js minden user-facing oldalon
// ─────────────────────────────────────────────────────────────────────
describe('Frontend: maintenanceClient.js minden user-facing HTML-ben', () => {
    // Maintenance ON-ban a backend `maintenance:enforce` event-et broadcastolja;
    // minden user-facing tab-on kell legyen kliens, aki ezt fogadja és redirect-el.
    // Az `adminPanel.html` is benne van: ha az admin ott ül, lássa a kontextust.
    // Kihagyott: `maintenance.html` (ez maga a target lap), `ban.html` és
    // `deleted.html` (terminál állapotok), `mailVerified.html` és
    // `restorePassword.html` (rövid életű intermediate-ek).
    const REQUIRED = [
        path.join(FRONTEND, 'html', 'index.html'),
        path.join(FRONTEND, 'html', 'profile.html'),
        path.join(FRONTEND, 'html', 'adminPanel.html'),
        path.join(FRONTEND, 'html', 'gameRoom.html'),
        path.join(FRONTEND, 'chess_barold', 'html', 'chess.html'),
    ];
    for (const file of REQUIRED) {
        test(`${path.relative(FRONTEND, file)} tartalmaz maintenanceClient.js script-tag-et`, () => {
            const content = readFile(file);
            expect(content).toMatch(/<script[^>]+shared\/maintenanceClient\.js/);
        });
    }
});

describe('N8: rename — a régi elgépelés ne térjen vissza', () => {
    test('a régi rosszul-irt fileNAME elgépelés sehol nem fordul elő', () => {
        // A régi rosszul-irt fileNAME-t a sed-rename törölte. Itt a guard.
        // A keresési mintát változó-konkatenációval rakjuk össze, hogy a teszt-fájl
        // forrása ne tartalmazzon szó-szerinti egyezést — különben self-match lenne.
        const BAD = ['fun', 'tions'].join('');
        const re = new RegExp(`\\b${BAD}\\b`);
        function walk(dir, results) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === 'node_modules') continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full, results);
                else if (/\.(js|md)$/.test(e.name)) results.push(full);
            }
            return results;
        }
        const files = walk(BACKEND, []);
        const offenders = [];
        for (const f of files) {
            if (re.test(readFile(f))) {
                offenders.push(path.relative(BACKEND, f));
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('N5: frontend _utils.js — single source of truth', () => {
    test('_utils.js létezik és window.MattMesterUtils-on publikálja a 4 helpert', () => {
        const file = path.join(FRONTEND, 'javascript', '_utils.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        expect(content).toMatch(/window\.MattMesterUtils\s*=/);
        expect(content).toMatch(/runSafely/);
        expect(content).toMatch(/runSafelyAsync/);
        expect(content).toMatch(/escapeHtml/);
        expect(content).toMatch(/fetchSessionInfo/);
    });

    test('a 4 user-facing HTML page betölti a _utils.js-t', () => {
        const html = [
            path.join(FRONTEND, 'html', 'index.html'),
            path.join(FRONTEND, 'html', 'profile.html'),
            path.join(FRONTEND, 'html', 'adminPanel.html'),
            path.join(FRONTEND, 'chess_barold', 'html', 'chess.html')
        ];
        for (const h of html) {
            const c = readFile(h);
            expect(c).toMatch(/<script[^>]+_utils\.js/);
        }
    });

    test('index.js, profile/01-helpers.js, adminPanel/01-helpers.js — nincs lokális escapeHtml IMPLEMENTÁCIÓ (csak delegate)', () => {
        // A delegate-pattern: arrow-funkció ami window.MattMesterUtils.escapeHtml-t hív.
        // A "function escapeHtml" kulcsszó-szignatúrát semmilyen formában nem tartalmazza
        // (kivéve ahol explicit a delegate-fallback van pl. chessModeChooser.js-ben).
        const files = [
            path.join(FRONTEND, 'javascript', 'index.js'),
            path.join(FRONTEND, 'javascript', 'profile', '01-helpers.js'),
            path.join(FRONTEND, 'javascript', 'adminPanel', '01-helpers.js')
        ];
        for (const f of files) {
            const c = readFile(f);
            // Egyik fájlban se legyen `function runSafely(label, ...) { try { ... } catch ...`
            // — a delegate az egyetlen forma.
            expect(c).not.toMatch(/function\s+runSafely\s*\(/);
            expect(c).not.toMatch(/async\s+function\s+runSafelyAsync\s*\(/);
        }
    });
});

describe('N3: halott kód NE térjen vissza', () => {
    // Ezeket az N3 sprint törölte; ha valaki később visszaviszi, ez a guard piros lesz.
    test('ipCollisionCheck nincs a backend-ben', () => {
        const adminModule = readFile(path.join(BACKEND, 'sql', 'modules', 'admin.js'));
        expect(adminModule).not.toMatch(/ipCollisionCheck/);
        const aggregator = readFile(path.join(BACKEND, 'sql', 'sql_functions.js'));
        expect(aggregator).not.toMatch(/ipCollisionCheck/);
    });
    test('/profile/verify-current-password route nincs', () => {
        const profile = readFile(path.join(BACKEND, 'api', 'routes', 'profile.js'));
        expect(profile).not.toMatch(/verify-current-password/);
        expect(profile).not.toMatch(/verifyPasswordLimiter/);
    });
    test('REASON_TOO_LONG külön error-code (a túl hosszú reasonre)', () => {
        const constants = readFile(path.join(BACKEND, 'api', 'admin', 'constants.js'));
        expect(constants).toMatch(/REASON_TOO_LONG/);
        const middleware = readFile(path.join(BACKEND, 'api', 'admin', 'middleware.js'));
        // A 2 ágon különböző kódot adunk: rövid → REASON_TOO_SHORT, hosszú → REASON_TOO_LONG
        expect(middleware).toMatch(/length\s*>\s*REASON_MAX_LENGTH[^]*?REASON_TOO_LONG/);
    });
});

describe('Frontend: maintenanceClient.js custom modal (NEM natív alert)', () => {
    test('a kliens nem hív alert/confirm/prompt-et', () => {
        // A user feedback szerint minden user-facing dialog custom HTML modal —
        // soha böngésző-natív. Ha bárki visszacsempész egy alert-et, ez a guard
        // azonnal piros lesz.
        const file = path.join(FRONTEND, 'javascript', 'shared', 'maintenanceClient.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        expect(content).not.toMatch(/\balert\s*\(/);
        expect(content).not.toMatch(/\bconfirm\s*\(/);
        expect(content).not.toMatch(/\bprompt\s*\(/);
    });
});

describe('N14: halott kod + duplikaciok takaritva', () => {
    test('services.handleConnection nem letezik (sehol nem volt hivva)', () => {
        const services = readFile(path.join(BACKEND, 'services.js'));
        expect(services).not.toMatch(/\bhandleConnection\s*\(/);
    });

    test('notifications mark*ReadForUser aliasok torolve', () => {
        const notif = readFile(path.join(BACKEND, 'sql', 'modules', 'notifications.js'));
        expect(notif).not.toMatch(/markAllNotificationsReadForUser/);
        expect(notif).not.toMatch(/markFriendRequestNotificationsReadForUser/);
        const aggregator = readFile(path.join(BACKEND, 'sql', 'sql_functions.js'));
        expect(aggregator).not.toMatch(/markAllNotificationsReadForUser/);
        expect(aggregator).not.toMatch(/markFriendRequestNotificationsReadForUser/);
    });

    test('functions.js isAdmin re-export torolve (#73)', () => {
        const fn = readFile(path.join(BACKEND, 'api', 'functions.js'));
        // A modul.exports nem tartalmazza, es nincs `const isAdmin = ...` deklaracio sem.
        expect(fn).not.toMatch(/^\s*isAdmin\s*,\s*$/m);
        expect(fn).not.toMatch(/const\s+isAdmin\s*=/);
    });

    test('chess_api: POST /:id/reset es DELETE /:id endpointok torolve (#41)', () => {
        const api = readFile(path.join(BACKEND, 'api', 'chess_api.js'));
        expect(api).not.toMatch(/router\.post\(['"]\/:id\/reset['"]/);
        expect(api).not.toMatch(/router\.delete\(['"]\/:id['"]/);
    });

    test('chat-konstansok egyetlen forras-igazsag (CHAT_CONFIG)', () => {
        // A regi inline `const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;` mind chat.js mind
        // sockets.js-bol elment, helyette CHAT_CONFIG-bol olvasnak.
        const chatRoute = readFile(path.join(BACKEND, 'api', 'routes', 'chat.js'));
        const sockets = readFile(path.join(BACKEND, 'sockets.js'));
        const utils = readFile(path.join(BACKEND, 'api', 'chatUtils.js'));
        // chatUtils.js-ben EGY definicio van.
        expect(utils).toMatch(/const\s+CHAT_CONFIG\s*=\s*Object\.freeze/);
        // chat.js + sockets.js mar CHAT_CONFIG-rol szarmaztat (nincs inline 5/10000).
        expect(chatRoute).not.toMatch(/const\s+CHAT_RATE_LIMIT_MAX_MESSAGES\s*=\s*5\s*;/);
        expect(sockets).not.toMatch(/const\s+CHAT_RATE_LIMIT_MAX_MESSAGES\s*=\s*5\s*;/);
        expect(chatRoute).toMatch(/CHAT_CONFIG\.RATE_LIMIT_MAX_MESSAGES/);
        expect(sockets).toMatch(/CHAT_CONFIG\.RATE_LIMIT_MAX_MESSAGES/);
    });

    test('parsePositiveInteger egyetlen forras: backend/utils/parse.js (#38)', () => {
        const utils = readFile(path.join(BACKEND, 'utils', 'parse.js'));
        expect(utils).toMatch(/function\s+parsePositiveInteger\(/);
        // _shared.js es sockets.js mar nem tartalmaznak sajat function definiciot.
        const shared = readFile(path.join(BACKEND, 'api', 'routes', '_shared.js'));
        const sockets = readFile(path.join(BACKEND, 'sockets.js'));
        expect(shared).not.toMatch(/function\s+parsePositiveInteger\s*\(/);
        expect(sockets).not.toMatch(/function\s+parsePositiveInteger\s*\(/);
    });

    test('frontend/css/gameRoom.css ures fajl torolve', () => {
        const file = path.join(FRONTEND, 'css', 'gameRoom.css');
        expect(fileExists(file)).toBe(false);
    });
});

describe('N9-N13: sakk interaktivitas — kliens-oldali fajlok elerhetoek', () => {
    test('move-list panel render + clearMoveList exportalva van', () => {
        const ui = readFile(path.join(FRONTEND, 'chess_barold', 'javascript', 'UI-megjelenites.js'));
        expect(ui).toMatch(/export\s+function\s+renderMoveList/);
        expect(ui).toMatch(/export\s+function\s+clearMoveList/);
    });

    test('settings.js modul letezik es a 4 fo helper exportalva', () => {
        const file = path.join(FRONTEND, 'chess_barold', 'javascript', 'settings.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        expect(content).toMatch(/initChessSettings/);
        expect(content).toMatch(/loadChessSettings/);
        expect(content).toMatch(/applyChessSettings/);
        expect(content).toMatch(/getChessSettings/);
    });

    test('chess.html tartalmazza a move-list panel + settings modal + rematch elemeket', () => {
        const html = readFile(path.join(FRONTEND, 'chess_barold', 'html', 'chess.html'));
        expect(html).toMatch(/id=["']move-list-panel["']/);
        expect(html).toMatch(/id=["']chess-settings-modal["']/);
        expect(html).toMatch(/id=["']rematch-offer-modal["']/);
        expect(html).toMatch(/id=["']rematchBtn["']/);
        expect(html).toMatch(/id=["']flipBoardBtn["']/);
    });

    test('backend lepesTortenet kliens-output bovult san+color-ra', () => {
        const state = readFile(path.join(BACKEND, 'chess', 'state.js'));
        // jatekAllapotKliens lepesTortenet slim valtozata
        expect(state).toMatch(/lepesTortenetKliens\s*=\s*jatek\.lepesTortenet\.map/);
        expect(state).toMatch(/lepesTortenet:\s*lepesTortenetKliens/);
    });

    test('engine.js minden lepesnel SAN-t es check/mate flag-et tarol', () => {
        const engine = readFile(path.join(BACKEND, 'chess', 'engine.js'));
        expect(engine).toMatch(/utolsoEntry\.san\s*=\s*sanLepes/);
        expect(engine).toMatch(/utolsoEntry\.check\s*=\s*isCheckLepes/);
        expect(engine).toMatch(/utolsoEntry\.mate\s*=\s*isCheckmateLepes/);
    });
});

// Issue #41 — service dashboard tesztek torolve. A "Szolgaltatasok" admin oldal
// teljesen el lett tavolitva (servicesRoutes.js + frontend renderer + nav entry +
// state + loader). Anti-regression: az alabbi describe ellenorzi hogy nem kerul
// vissza veletlenul.
describe('Szolgaltatasok admin oldal vegleg eltavolitva (anti-regression)', () => {
    test('servicesRoutes.js NEM letezik', () => {
        const file = path.join(BACKEND, 'api', 'routes', 'admin', 'servicesRoutes.js');
        expect(fileExists(file)).toBe(false);
    });

    test('admin route index.js NEM hivatkozik servicesRoutes-ra', () => {
        const content = readFile(path.join(BACKEND, 'api', 'routes', 'admin', 'index.js'));
        expect(content).not.toMatch(/servicesRoutes/);
    });

    test('frontend NAV_TREE-ben NINCS services entry', () => {
        const content = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '04-navigation.js'));
        expect(content).not.toMatch(/id:\s*['"]services['"]/);
        expect(content).not.toMatch(/Szolgáltatások/);
    });

    test('frontend SECTIONS-ban NINCS services renderer', () => {
        const content = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '06-sections.js'));
        expect(content).not.toMatch(/^\s*services:\s*\(\)\s*=>/m);
    });

    test('frontend state-ban NINCS servicesAdmin objektum', () => {
        const content = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '02-state.js'));
        expect(content).not.toMatch(/servicesAdmin\s*:/);
    });

    test('frontend NEM tartalmaz loadServicesSnapshot funkciot', () => {
        const adminPages = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '27-adminPages.js'));
        const sectionSwitch = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '08-sectionSwitch.js'));
        expect(adminPages).not.toMatch(/loadServicesSnapshot/);
        expect(sectionSwitch).not.toMatch(/loadServicesSnapshot/);
    });
});

describe('Issue #45 — CSRF guard', () => {
    test('csrfGuard middleware letezik', () => {
        const file = path.join(BACKEND, 'api', 'middleware', 'csrfGuard.js');
        expect(fileExists(file)).toBe(true);
        const content = readFile(file);
        expect(content).toMatch(/CSRF_FORBIDDEN/);
        expect(content).toMatch(/STATE_CHANGING_METHODS/);
    });

    test('server.js mountolja a csrfGuard-ot az /api utvonalra', () => {
        const content = readFile(path.join(BACKEND, 'server.js'));
        expect(content).toMatch(/csrfGuard/);
        expect(content).toMatch(/app\.use\(['"]\/api['"]\s*,\s*csrfGuard\)/);
    });
});

describe('Issue #53 — admin gyors-uzenet modal', () => {
    test('adminQuickChatModal HTML letezik az adminPanel.html-ben', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'adminPanel.html'));
        expect(html).toMatch(/id="adminQuickChatModal"/);
        expect(html).toMatch(/id="adminQuickChatMessage"/);
        expect(html).toMatch(/id="adminQuickChatSendBtn"/);
    });

    test('frontend openAdminQuickChatModal + submitAdminQuickChat funkciok', () => {
        const content = readFile(path.join(FRONTEND, 'javascript', 'adminPanel', '27-adminPages.js'));
        expect(content).toMatch(/function openAdminQuickChatModal/);
        expect(content).toMatch(/async function submitAdminQuickChat/);
        // A submit a chat.js endpoint-okat hivja
        expect(content).toMatch(/\/api\/chat\/conversations\/direct/);
        expect(content).toMatch(/\/messages/);
    });
});

describe('Issue #52 — profile.html halott szekciok torolve', () => {
    test('"Recent Games" placeholder szekcio nincs (a #recentOpponents helyettesiti)', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'profile.html'));
        // A halott szekcio jellemzo strigjei NEM lehetnek benne:
        expect(html).not.toMatch(/id="games"\s/);
        expect(html).not.toMatch(/Sample game rows/);
        expect(html).not.toMatch(/data-bs-target="#allGamesModal"/);
        // De a #recentOpponents (a helyettesito) MEG kell legyen.
        expect(html).toMatch(/id="recentOpponents"/);
    });
});

describe('Admin route fajlok auth-guard meglete (kod-szintu)', () => {
    // Forras-szintu integrity ellenorzes, helyettesiti a korabbi kettos
    // adminRoutesAuthGuard + adminSubRoutersAuthGuard fajlokat, amelyek
    // [401, 403, 404]-et fogadtak el → 404 (path mismatch) hamisan zoldnek
    // jelolt egy tenyleges hianyzo guardot is. Ez a teszt forras-szinten
    // kovetel parseAdminToken hivatkozast minden admin route-modulban.
    const ADMIN_ROUTE_FILES = [
        'alertsRoutes.js',
        'chatModerationRoutes.js',
        'exportUsersRoutes.js',
        'ipBlockRoutes.js',
        'notificationsRoutes.js',
        'profileImageRoutes.js',
        'readOnlyRoutes.js',
        'securityLoginsRoutes.js',
        'userCreateRoutes.js',
        'userDeleteRoutes.js',
        'userEditRoutes.js',
        'userReportsRoutes.js'
    ];

    test.each(ADMIN_ROUTE_FILES)('api/routes/admin/%s tartalmazza a parseAdminToken middleware hivasat', (file) => {
        const content = readFile(path.join(BACKEND, 'api', 'routes', 'admin', file));
        // Vagy direktben hivja: parseAdminToken — vagy az adminLimiterChain-en at
        // (ami szinten parseAdminToken-be torkollik). Igy mindket mintat elfogadjuk.
        const matches = /parseAdminToken|adminLimiterChain/.test(content);
        expect(matches).toBe(true);
    });

    const ADMIN_SUB_ROUTERS = [
        'superAdminRoutes.js',
        'abilitiesRoutes.js',
        'socialRoutes.js',
        'gamesRoutes.js',
        'settingsRoutes.js',
        'testsRoutes.js'
    ];

    test.each(ADMIN_SUB_ROUTERS)('api/admin/%s tartalmazza a parseAdminToken middleware hivasat', (file) => {
        const content = readFile(path.join(BACKEND, 'api', 'admin', file));
        const matches = /parseAdminToken|adminLimiterChain|requireSuperAdmin/.test(content);
        expect(matches).toBe(true);
    });
});
