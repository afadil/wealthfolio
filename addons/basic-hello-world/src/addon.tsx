import { type AddonContext } from '@wealthfolio/addon-sdk';
import React from 'react';
import { AlertsIcon } from './icons';

// Hello World Page Component - defined inline to avoid import issues
function HelloWorldPage() {
  const currentTime = new Date().toLocaleString();

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', color: '#333', marginBottom: '0.5rem' }}>
          👋 Hello World!
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Welcome to your first Wealthfolio addon
        </p>
      </header>

      {/* Main Content */}
      <main>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.8rem' }}>
            🎉 Congratulations!
          </h2>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
            You've successfully created and installed your first Wealthfolio addon.
            This demonstrates the basic structure and capabilities of the addon system.
          </p>
        </div>

        {/* Features Demo */}
        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9'
          }}>
            <h3 style={{ color: '#333', marginBottom: '1rem' }}>📋 What This Addon Shows</h3>
            <ul style={{ color: '#666', lineHeight: '1.8' }}>
              <li>✅ Sidebar navigation integration</li>
              <li>✅ Custom route registration</li>
              <li>✅ React component rendering</li>
              <li>✅ Basic styling and layout</li>
              <li>✅ Proper addon lifecycle management</li>
            </ul>
          </div>

          <div style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9'
          }}>
            <h3 style={{ color: '#333', marginBottom: '1rem' }}>🚀 Next Steps</h3>
            <ul style={{ color: '#666', lineHeight: '1.8' }}>
              <li>🔧 Explore the Wealthfolio API</li>
              <li>📊 Add data visualizations</li>
              <li>🎨 Customize the UI styling</li>
              <li>⚙️ Add user settings</li>
              <li>📱 Make it responsive</li>
            </ul>
          </div>
        </div>

        {/* Info Panel */}
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          backgroundColor: '#fff',
          border: '1px solid #ddd',
          borderRadius: '8px'
        }}>
          <h3 style={{ color: '#333', marginBottom: '1rem' }}>ℹ️ Addon Information</h3>
          <div style={{ display: 'grid', gap: '0.5rem', color: '#666' }}>
            <div><strong>Current Time:</strong> {currentTime}</div>
            <div><strong>Addon ID:</strong> hello-world-addon</div>
            <div><strong>SDK Version:</strong> 1.1.0</div>
            <div><strong>React Version:</strong> {React.version}</div>
          </div>
        </div>

        {/* Call to Action */}
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          backgroundColor: '#e8f5e8',
          border: '1px solid #c3e6c3',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#2d5a2d', marginBottom: '1rem' }}>🎯 Ready to Build More?</h3>
          <p style={{ color: '#2d5a2d', marginBottom: '1rem' }}>
            Check out the documentation and examples to learn how to:
          </p>
          <ul style={{ 
            color: '#2d5a2d', 
            textAlign: 'left', 
            display: 'inline-block',
            margin: '0 auto'
          }}>
            <li>Access portfolio data and account information</li>
            <li>Create interactive charts and visualizations</li>
            <li>Integrate with external APIs and services</li>
            <li>Build complex multi-page applications</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

/**
 * Hello World Addon
 * 
 * A simple addon that demonstrates:
 * - Adding a sidebar navigation item
 * - Registering a custom route
 * - Creating a basic React component
 * - Proper cleanup on disable
 */
export default function enable(ctx: AddonContext) {
  console.log('🚀 Hello World addon is being enabled!');
  console.log('📋 Context received:', ctx);
  console.log('📋 Context sidebar:', ctx.sidebar);
  console.log('📋 Context router:', ctx.router);

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  // Add a sidebar navigation item
  console.log('📝 Attempting to add sidebar item...');
  const sidebarItemConfig = {
    id: 'hello-world',
    label: 'Hello World',
    icon: <AlertsIcon className="h-5 w-5" />, // Using AlertsIcon component with JSX
    route: '/addon/hello-world',
    order: 100 // Lower numbers appear first
  };
  console.log('📝 Sidebar item config:', sidebarItemConfig);

  const sidebarItem = ctx.sidebar.addItem(sidebarItemConfig);
  console.log('📝 Sidebar item added, result:', sidebarItem);
  addedItems.push(sidebarItem);

  // Create a wrapper component that can be lazy-loaded
  const HelloWorldWrapper = () => <HelloWorldPage />;

  // Register a route for our component using the same pattern as Portfolio Tracker
  console.log('🔗 Attempting to add route...');
  ctx.router.add({
    path: '/addon/hello-world',
    component: React.lazy(() => Promise.resolve({ default: HelloWorldWrapper }))
  });
  console.log('🔗 Route added successfully');

  // Register cleanup callback
  ctx.onDisable(() => {
    console.log('🛑 Hello World addon is being disabled');
    
    // Remove all sidebar items
    addedItems.forEach(item => {
      try {
        console.log('🗑️ Removing sidebar item:', item);
        item.remove();
      } catch (error) {
        console.error('❌ Error removing sidebar item:', error);
      }
    });
    
    console.log('✅ Hello World addon has been cleanly disabled');
  });

  console.log('✨ Hello World addon has been successfully enabled!');
  console.log('📊 Summary:');
  console.log('  - Sidebar items added:', addedItems.length);
  console.log('  - Route registered: /addons/hello-world');
}
