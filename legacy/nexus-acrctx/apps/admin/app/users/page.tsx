import { PrismaClient } from "@repo/database";
import { Search, ShieldAlert, BadgeCheck, Ban } from "lucide-react";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export default async function UsersManagement() {
  try {
    await prisma.publicKeyBundle.count();
  } catch {
    // DB unavailable — render with mock value
  }

  // Simulated users since Prisma model currently only holds KeyBundles.
  // In a real iteration, we will extend schema.prisma with a full User and Session model.
  const users = [
    { id: "u1", name: "Aryan Sharma", role: "admin", status: "active", tokens: 1250, lastActive: "2 min ago" },
    { id: "u2", name: "Nexus Bot", role: "system", status: "active", tokens: 0, lastActive: "Just now" },
    { id: "u3", name: "Anonymous_491", role: "user", status: "banned", tokens: 5, lastActive: "1 day ago" }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-white">
            User Matrix
          </h1>
          <p className="text-sm text-gray-400 mt-1">Manage network access and social capital distribution.</p>
        </div>
        
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by ID or Node..." 
            className="w-full md:w-64 bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-neon-blue)] transition-colors"
          />
        </div>
      </header>

      {/* Users Data Grid */}
      <section className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-xs uppercase tracking-widest text-gray-400 font-bold border-b border-white/10">
                <th className="py-4 px-6">Identity Node</th>
                <th className="py-4 px-6">Access Level</th>
                <th className="py-4 px-6">Social Capital ($STAAS)</th>
                <th className="py-4 px-6">Last Ping</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {users.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-neon-blue)] to-[var(--color-neon-purple)] flex items-center justify-center font-bold text-xs text-black shadow-[0_0_10px_rgba(0,243,255,0.3)]">
                        {user.name.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white">{user.name}</p>
                        <p className="text-xs text-gray-500 font-mono">ID: {user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit
                      ${user.role === 'admin' ? 'bg-[#ff007f]/20 text-[#ff007f]' : 
                        user.role === 'system' ? 'bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]' : 
                        'bg-gray-800 text-gray-300'}
                    `}>
                      {user.role === 'admin' && <ShieldAlert size={12} />}
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4 px-6 font-mono text-[var(--color-neon-green)]">
                    {user.tokens.toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-gray-400 text-xs">
                    {user.lastActive}
                  </td>
                  <td className="py-4 px-6 text-right space-x-2">
                    {user.status === 'banned' ? (
                      <span className="text-xs font-bold text-red-400 bg-red-900/30 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5">
                        <Ban size={12} /> BANNED
                      </span>
                    ) : (
                      <>
                        <button className="text-gray-400 hover:text-green-400 transition-colors p-2 rounded hover:bg-white/5" title="Verify Node">
                          <BadgeCheck size={16} />
                        </button>
                        <button className="text-gray-400 hover:text-red-400 transition-colors p-2 rounded hover:bg-white/5" title="Ban User Node">
                          <Ban size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
