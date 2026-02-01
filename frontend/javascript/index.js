document.addEventListener('DOMContentLoaded', () => {

    // fetchInsert('testuserballz');
    fetchData();
});
async function fetchInsert(username) {
    try {
        const response = await fetch('http://127.0.0.1:3000/api/testinsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Insert hiba:', error);
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