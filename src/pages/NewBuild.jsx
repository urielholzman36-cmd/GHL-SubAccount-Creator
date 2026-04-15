import { useState } from 'react';
import { Link } from 'react-router-dom';
import BuildForm from '../components/BuildForm';
import ProgressTracker from '../components/ProgressTracker';

export default function NewBuild() {
  const [activeBuildId, setActiveBuildId] = useState(null);
  const [clientName, setClientName] = useState('');

  function handleBuildStarted(id, name) {
    setClientName(name);
    setActiveBuildId(id);
  }

  function handleNewBuild() {
    setActiveBuildId(null);
    setClientName('');
  }

  if (activeBuildId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{clientName || 'Onboarding'}</h1>
            <p className="text-sm text-white/30">Building client environment</p>
          </div>
          <button
            onClick={handleNewBuild}
            className="text-xs font-medium text-white/25 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white/50 hover:border-white/20 transition"
          >
            + New Client
          </button>
        </div>
        <ProgressTracker buildId={activeBuildId} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">New Client</h1>
          <p className="text-sm text-white/30">Fill in client details and start the onboarding</p>
        </div>
        <Link
          to="/onboarding/history"
          className="text-xs font-medium text-white/25 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white/50 hover:border-white/20 transition"
        >
          Build History
        </Link>
      </div>
      <BuildForm onBuildStarted={handleBuildStarted} />
    </div>
  );
}
