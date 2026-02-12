const board = document.getElementById('chess-board');

// 8x8 mező generálása
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const square = document.createElement('div');
    square.classList.add('square');
    square.classList.add((row + col) % 2 === 0 ? 'white' : 'black');
    square.dataset.row = row;
    square.dataset.col = col;

    // Kattintás esemény hozzáadása
    square.addEventListener('click', () => {
      console.log(`Kattintott mező: sor ${row}, oszlop ${col}`);
    });

    board.appendChild(square);
  }
}
