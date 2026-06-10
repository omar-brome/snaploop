import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Sorry, this page isn't available.</h1>
      <p className="max-w-md text-sm text-muted-light dark:text-muted-dark">
        The link you followed may be broken, or the page may have been removed.
      </p>
      <Link to="/">
        <Button variant="text">Go back to Snaploop</Button>
      </Link>
    </div>
  );
}
