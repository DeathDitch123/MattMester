const { createTables } = require('./sql/database');

async function setupDatabase() {
    try {
        await createTables();
        console.log('Database tables created successfully.');
    } catch (error) {
        console.error('Error creating tables:', error);
    } finally {
        process.exit();
    }
}

setupDatabase();