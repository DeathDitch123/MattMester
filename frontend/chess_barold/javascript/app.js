document.addEventListener("DOMContentLoaded", init);

function init() {
    checkLogin();
    buildLayout();
    showHome();
}

/* =============================
   LOGIN ELLENŐRZÉS
============================= */

function checkLogin() {
    const loggedIn = localStorage.getItem("loggedIn");

    if (loggedIn !== "true") {
        window.location.href = "login.html";
    }
}

/* =============================
   ALAP LAYOUT
============================= */

function buildLayout() {
    const app = document.getElementById("app");

    createNavbar(app);
    createMainContent(app);
}

function createNavbar(parent) {
    const nav = document.createElement("div");
    nav.classList.add("navbar");

    const navLeft = document.createElement("div");
    navLeft.classList.add("nav-left");

    const navRight = document.createElement("div");
    navRight.classList.add("nav-right");

    const homeBtn = document.createElement("button");
    homeBtn.textContent = "Főoldal";
    homeBtn.addEventListener("click", showHome);

    const productsBtn = document.createElement("button");
    productsBtn.textContent = "Termékek";
    productsBtn.addEventListener("click", showProducts);

    const profileBtn = document.createElement("button");
    profileBtn.textContent = "Profil";
    profileBtn.addEventListener("click", showProfile);

    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "Kijelentkezés";
    logoutBtn.addEventListener("click", logout);

    navLeft.appendChild(homeBtn);
    navLeft.appendChild(productsBtn);
    navLeft.appendChild(profileBtn);

    navRight.appendChild(logoutBtn);

    nav.appendChild(navLeft);
    nav.appendChild(navRight);

    parent.appendChild(nav);
}

function createMainContent(parent) {
    const main = document.createElement("div");
    main.id = "main-content";
    parent.appendChild(main);
}

function clearMain() {
    const main = document.getElementById("main-content");
    main.innerHTML = "";
}

/* =============================
   OLDALAK
============================= */

function showHome() {
    clearMain();

    const main = document.getElementById("main-content");

    const title = document.createElement("h1");
    title.textContent = "Üdvözöllek a főoldalon!";

    const text = document.createElement("p");
    text.textContent = "Ez az oldal teljesen JavaScriptből generálódik.";

    main.appendChild(title);
    main.appendChild(text);
}

function showProducts() {
    clearMain();

    const main = document.getElementById("main-content");

    const products = [
        { name: "Laptop", price: 250000 },
        { name: "Egér", price: 5000 },
        { name: "Billentyűzet", price: 12000 }
    ];

    const title = document.createElement("h1");
    title.textContent = "Termékek";
    main.appendChild(title);

    products.forEach(product => {
        const card = document.createElement("div");
        card.classList.add("card");

        const name = document.createElement("h3");
        name.textContent = product.name;

        const price = document.createElement("p");
        price.textContent = product.price + " Ft";

        const btn = document.createElement("button");
        btn.textContent = "Kosárba";

        btn.addEventListener("click", () => {
            alert(product.name + " hozzáadva a kosárhoz!");
        });

        card.appendChild(name);
        card.appendChild(price);
        card.appendChild(btn);

        main.appendChild(card);
    });
}

function showProfile() {
    clearMain();

    const main = document.getElementById("main-content");

    const title = document.createElement("h1");
    title.textContent = "Profil";

    const userInfo = document.createElement("p");
    userInfo.textContent = "Bejelentkezett felhasználó.";

    main.appendChild(title);
    main.appendChild(userInfo);
}

/* =============================
   LOGOUT
============================= */

function logout() {
    localStorage.removeItem("loggedIn");
    window.location.href = "login.html";
}
