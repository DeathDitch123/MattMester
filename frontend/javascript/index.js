document.addEventListener('DOMContentLoaded', () => {

    // fetchInsert('1', 'testuser'); <-- Teszt beszúrás
    fetchData();
});
async function fetchInsert(id, username) {
    try {
        const response = await fetch('http://127.0.0.1:3000/api/testinsert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, username })
        });
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Hiba a fetchInsert során:', error);
    }
}
async function fetchData() {
    try {
        const response = await fetch('http://127.0.0.1:3000/api/testselect', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Hiba a fetchData során:', error);
    }
}