import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ProjectPulseApp } from "./components/layout/AppShell";

export default function App() {
  return (
    <ErrorBoundary>
      <ProjectPulseApp />
    </ErrorBoundary>
  );
}
