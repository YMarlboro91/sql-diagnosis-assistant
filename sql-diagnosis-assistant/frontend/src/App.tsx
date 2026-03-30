import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, ConfigProvider, Menu } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BugOutlined, SettingOutlined } from '@ant-design/icons';
import ExceptionList from './pages/ExceptionList';
import ExceptionDetail from './pages/ExceptionDetail';
import RulesConfig from './pages/RulesConfig';

const { Header, Content } = Layout;

function Navigation() {
  const location = useLocation();

  const menuItems = [
    {
      key: '/exceptions',
      icon: <BugOutlined />,
      label: '异常列表',
    },
    {
      key: '/rules',
      icon: <SettingOutlined />,
      label: '规则配置',
    },
  ];

  return (
    <Layout className="min-h-screen bg-slate-50">
      <Header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center px-6 shadow-lg">
        <h1 className="text-xl font-bold m-0 tracking-wide mr-8">
          🔍 SQL 异常诊断中心
        </h1>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          className="bg-transparent border-0 flex-1"
          items={menuItems.map(item => ({
            ...item,
            style: { color: 'rgba(255,255,255,0.85)' },
          }))}
          onClick={({ key }) => {
            window.location.href = key;
          }}
        />
      </Header>
      <Content className="p-0">
        <Routes>
          <Route path="/" element={<Navigate to="/exceptions" replace />} />
          <Route path="/exceptions" element={<ExceptionList />} />
          <Route path="/exceptions/:id" element={<ExceptionDetail />} />
          <Route path="/rules" element={<RulesConfig />} />
        </Routes>
      </Content>
    </Layout>
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
