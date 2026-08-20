import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Menu, Activity, ShieldAlert, Wifi, Settings, Home, X, Moon, Sun, Search, Navigation, FileStack } from 'lucide-react';
import { motion } from 'framer-motion';

export const Sidebar: React.FC = () => {
  const {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    theme,
    toggleTheme,
    searchSubmenuOpen,
    toggleSearchSubmenu,
    openRouteBuilder,
    routeBuilder,
    kmzFilesPanelOpen,
    toggleKmzFilesPanel
  } = useAppStore(useShallow((state) => ({
    sidebarOpen: state.sidebarOpen,
    setSidebarOpen: state.setSidebarOpen,
    toggleSidebar: state.toggleSidebar,
    theme: state.theme,
    toggleTheme: state.toggleTheme,
    searchSubmenuOpen: state.searchSubmenuOpen,
    toggleSearchSubmenu: state.toggleSearchSubmenu,
    openRouteBuilder: state.openRouteBuilder,
    routeBuilder: state.routeBuilder,
    kmzFilesPanelOpen: state.kmzFilesPanelOpen,
    toggleKmzFilesPanel: state.toggleKmzFilesPanel
  })));

  const menuItems = [
    { icon: <Home size={20} />, label: 'Dashboard', action: undefined, isActive: false },
    { icon: <Navigation size={20} />, label: 'Penentuan Rute A-Z', action: openRouteBuilder, isActive: routeBuilder.isOpen },
    { icon: <Search size={20} />, label: 'Cari Node (XCC/POP/ODP)', action: toggleSearchSubmenu, isActive: searchSubmenuOpen },
    { icon: <FileStack size={20} />, label: 'File KMZ', action: toggleKmzFilesPanel, isActive: kmzFilesPanelOpen },
    { icon: <Activity size={20} />, label: 'Network Flow', action: undefined, isActive: false },
    { icon: <ShieldAlert size={20} />, label: 'Incidents', action: undefined, isActive: false },
    { icon: <Wifi size={20} />, label: 'Sensors', action: undefined, isActive: false },
    { icon: <Settings size={20} />, label: 'Settings', action: undefined, isActive: false },
  ];

  return (
    <>
      {/* Mobile Hamburger overlay */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 glass-panel rounded-lg text-text-primary"
        onClick={toggleSidebar}
      >
        <Menu size={24} />
      </button>

      {/* Sidebar Container */}
      <motion.div 
        className={`fixed top-0 left-0 h-full z-40 flex flex-col glass-panel border-r border-border transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-0 md:w-16'} overflow-hidden`}
        initial={false}
      >
        <div className="flex items-center justify-between p-4 mt-12 md:mt-0 border-b border-border">
          <div className="flex items-center space-x-3 text-cyan-400 font-mono font-bold tracking-widest whitespace-nowrap">
            <Activity className={sidebarOpen ? "opacity-100" : "opacity-0 md:opacity-100 transition-opacity"} />
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: sidebarOpen ? 1 : 0 }}
              className="text-lg"
            >
              FIBER.OS
            </motion.span>
          </div>
          {sidebarOpen && (
            <button className="md:hidden text-text-secondary" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2">
          {menuItems.map((item, idx) => (
            <button 
              key={idx}
              onClick={item.action} 
              className={`flex items-center space-x-4 px-4 py-3 mx-2 rounded-lg transition-all group ${
                item.isActive 
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-panel-hover'
              }`}
            >
              <div className={item.isActive ? "text-cyan-400" : "group-hover:text-cyan-400 transition-colors"}>
                {item.icon}
              </div>
              <motion.span 
                className="whitespace-nowrap font-medium text-xs font-mono"
                initial={false}
                animate={{ opacity: sidebarOpen ? 1 : 0, display: sidebarOpen ? 'block' : 'none' }}
              >
                {item.label}
              </motion.span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={toggleTheme}
            className="flex items-center space-x-4 w-full p-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-panel-hover transition-colors group"
          >
            <div className="group-hover:text-cyan-400 transition-colors">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </div>
            <motion.span 
              className="whitespace-nowrap font-medium text-xs font-mono"
              initial={false}
              animate={{ opacity: sidebarOpen ? 1 : 0, display: sidebarOpen ? 'block' : 'none' }}
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </motion.span>
          </button>
        </div>
      </motion.div>

      {/* Toggle Handle for Desktop */}
      <div className="hidden md:flex fixed left-16 top-1/2 -translate-y-1/2 z-40 transition-all duration-300" style={{ transform: sidebarOpen ? 'translateX(192px) translateY(-50%)' : 'translateY(-50%)' }}>
        <button 
          onClick={toggleSidebar}
          className="bg-surface backdrop-blur border border-border border-l-0 rounded-r-lg p-1 text-text-secondary hover:text-text-primary shadow-md"
        >
          <Menu size={16} />
        </button>
      </div>
    </>
  );
};
