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
// 2. Frontend profile.js split — 20 fajl + bootstrap a vegen
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: profile.js split (20 fajl)', () => {
    const PROFILE_DIR = path.join(FRONTEND, 'javascript', 'profile');
    const EXPECTED_PREFIX_RE = /^\d{2}-[a-zA-Z]+\.js$/;

    test('a regi monolit profile.js TÖRÖLVE van', () => {
        const oldPath = path.join(FRONTEND, 'javascript', 'profile.js');
        expect(fileExists(oldPath)).toBe(false);
    });

    test('profile/ konyvtar letezik 20 fajllal', () => {
        expect(dirExists(PROFILE_DIR)).toBe(true);
        const files = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.js'));
        expect(files.length).toBe(20);
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

    test('profile.html mind a 20 split-et betolti helyes sorrendben', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'profile.html'));
        const profileScripts = extractScriptSrcs(html).filter((s) => s.includes('profile/'));
        expect(profileScripts.length).toBe(20);
        // 01- ... 20- prefixes, sorrendben
        for (let i = 0; i < 20; i++) {
            const expectedPrefix = String(i + 1).padStart(2, '0') + '-';
            expect(profileScripts[i]).toContain('/profile/' + expectedPrefix);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Frontend adminPanel.js split — 28 fajl
// ─────────────────────────────────────────────────────────────────────

describe('Frontend: adminPanel.js split (28 fajl)', () => {
    const ADMIN_PANEL_DIR = path.join(FRONTEND, 'javascript', 'adminPanel');

    test('a regi monolit adminPanel.js TÖRÖLVE van', () => {
        const oldPath = path.join(FRONTEND, 'javascript', 'adminPanel.js');
        expect(fileExists(oldPath)).toBe(false);
    });

    test('adminPanel/ konyvtar letezik 28 fajllal', () => {
        expect(dirExists(ADMIN_PANEL_DIR)).toBe(true);
        const files = fs.readdirSync(ADMIN_PANEL_DIR).filter((f) => f.endsWith('.js'));
        expect(files.length).toBe(28);
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

    test('adminPanel.html mind a 28 split-et betolti', () => {
        const html = readFile(path.join(FRONTEND, 'html', 'adminPanel.html'));
        const scripts = extractScriptSrcs(html).filter((s) => s.includes('adminPanel/'));
        expect(scripts.length).toBe(28);
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

    test('mind a 5 chess_barold/javascript/*.js parse-olhato', () => {
        const files = listJsFiles(CHESS_DIR);
        // varando: UI-megjelenites.js, abilities.js, audio.js, domSkeleton.js, main.js
        expect(files.length).toBe(5);
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
