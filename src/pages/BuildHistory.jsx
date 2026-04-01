import StatsCards from '../components/StatsCards';
import BuildTable from '../components/BuildTable';

export default function BuildHistory() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-navy mb-1">Build History</h1>
      <p className="text-gray-500 text-sm mb-6">All sub-account builds</p>
      <StatsCards />
      <div className="mt-6">
        <BuildTable />
      </div>
    </div>
  );
}
