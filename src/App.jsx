import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-page-bg font-sans">
      <Routes>
        <Route path="/" element={<div className="p-8 text-navy text-xl font-bold">VO360 Sub-Account Builder</div>} />
      </Routes>
    </div>
  );
}
