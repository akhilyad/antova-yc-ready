import Team01 from '@/components/ui/team-01';

interface TeamPageProps {
  onBackHome: () => void;
  onAuditClick: () => void;
}

export function TeamPage({ onBackHome, onAuditClick }: TeamPageProps) {
  return <Team01 onBackHome={onBackHome} onAuditClick={onAuditClick} />;
}

export default TeamPage;
