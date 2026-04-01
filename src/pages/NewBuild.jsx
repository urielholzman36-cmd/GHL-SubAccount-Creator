import { useState } from 'react';
import BuildForm from '../components/BuildForm';
import ProgressTracker from '../components/ProgressTracker';

export default function NewBuild() {
  const [activeBuildId, setActiveBuildId] = useState(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-navy">New Sub-Account</h1>
        <p className="text-sm text-gray-500">Fill in client details and click Create</p>
      </div>
      <div className="flex gap-6">
        <div className="flex-1 min-w-[320px]">
          <BuildForm onBuildStarted={setActiveBuildId} />
        </div>
        <div className="w-80 flex-shrink-0">
          {activeBuildId && <ProgressTracker buildId={activeBuildId} />}
        </div>
      </div>
    </div>
  );
}
