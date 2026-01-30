
const { initDatabase } = require('./sql/database');

async function setupDatabase() {
    try {
        await initDatabase();
        console.log('Database and tables created successfully.');
    } catch (error) {
        console.error('Error creating database or tables:', error);
    } finally {
        process.exit();
    }
}

setupDatabase();