document.addEventListener("DOMContentLoaded", init);

async function init() {
    const user = await checkSession();

    if (!user) {
        window.location.href = "/html/login.html";
        return;
    }

    buildLayout(user);
    showHome(user);
}

/* =============================
   SESSION CHECK
============================= */

async function checkSession() {
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json();

        if (data.loggedIn) {
            return data.user;
        }

        return null;

    } catch (error) {
        console.error("Session hiba:", error);
        return null;
    }
}

/* =============================
   LAYOUT
============================= */

function buildLayout(user) {

    const app = document.getElementById("app");
    app.innerHTML = "";

    const nav = document.createElement("div");
    nav.classList.add("navbar");

    const left = document.createElement("div");
    const right = document.createElement("div");

    // Gombok
    const homeBtn = createNavButton("Főoldal", () => showHome(user));
    const profileBtn = createNavButton("Profil", () => showProfile(user));
    const logoutBtn = createNavButton("Kijelentkezés", logout);

    left.appendChild(homeBtn);
    left.appendChild(profileBtn);
    right.appendChild(logoutBtn);

    nav.appendChild(left);
    nav.appendChild(right);

    const main = document.createElement("div");
    main.id = "main-content";

    app.appendChild(nav);
    app.appendChild(main);
}

function createNavButton(text, callback) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", callback);
    return btn;
}

function clearMain() {
    document.getElementById("main-content").innerHTML = "";
}

/* =============================
   OLDALAK
============================= */

function showHome(user) {
    clearMain();
    const main = document.getElementById("main-content");

    const title = document.createElement("h1");
    title.textContent = "Üdv, " + user.username + "!";

    const elo = document.createElement("p");
    elo.textContent = "ELO pontszám: " + user.elo;

    const playBtn = document.createElement("button");
    playBtn.classList.add("play-btn");
    playBtn.innerHTML = "PLAY NOW<br><small>Ranked Match</small>";

    main.appendChild(title);
    main.appendChild(elo);
    main.appendChild(playBtn);
}

function showProfile(user) {
    clearMain();
    const main = document.getElementById("main-content");

    const title = document.createElement("h2");
    title.textContent = "Profil adatok";

    const username = document.createElement("p");
    username.textContent = "Felhasználónév: " + user.username;

    const elo = document.createElement("p");
    elo.textContent = "ELO: " + user.elo;

    main.appendChild(title);
    main.appendChild(username);
    main.appendChild(elo);
}

/* =============================
   LOGOUT
============================= */

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = "/html/login.html";
}
