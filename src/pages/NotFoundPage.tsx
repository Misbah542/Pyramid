import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { RepoVerseMark } from '@/components/RepoVerseMark';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-base bg-spatial px-5 text-center">
      <RepoVerseMark className="h-8 w-8" />
      <div className="flex items-center gap-2 text-sm text-muted">
        <Compass className="h-4 w-4" />
        That page is not part of the graph.
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-faint">
        The URL does not match any RepoVerse route. Head back and paste a repository URL, or open the demo workspace.
      </p>
      <div className="flex gap-2">
        <Link to="/">
          <Button variant="primary" size="sm">
            Back to home
          </Button>
        </Link>
        <Link to="/workspace?demo=1">
          <Button variant="secondary" size="sm">
            Open demo
          </Button>
        </Link>
      </div>
    </div>
  );
}
