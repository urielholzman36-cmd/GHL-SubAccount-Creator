import app from './app.js';

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`GHL Sub-Account Builder running on http://localhost:${PORT}`);
});
