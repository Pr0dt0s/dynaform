import Centered from "@/components/Centered";

export default function Home() {
  return (
    <Centered>
      <div className="max-w-lg text-center space-y-4">
        <h1 className="text-xl font-semibold">dynaform</h1>
        <p className="text-sm text-gray-500">
          Short-lived, end-to-end encrypted forms for AI agents. There&apos;s nothing to see here
          directly — open a form link an agent gave you, or install the Claude skill below.
        </p>
        <pre className="text-left text-xs bg-gray-50 border border-gray-200 rounded-md p-3 overflow-x-auto">
          <code>curl -fsSL https://dynaform.prcm.xyz/install.sh | sh</code>
        </pre>
        <p className="text-xs text-gray-400">
          Installs to <code>~/.claude/skills/dynaform</code>. Requires Node.js &gt;= 19, no other
          dependencies.
        </p>
      </div>
    </Centered>
  );
}
