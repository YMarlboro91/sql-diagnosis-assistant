import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ExceptionList from './pages/ExceptionList';
import ExceptionDetail from './pages/ExceptionDetail';

const { Header, Content } = Layout;

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Layout className="min-h-screen bg-slate-50">
          <Header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center px-6 shadow-lg">
            <h1 className="text-xl font-bold m-0 tracking-wide">
              🔍 SQL 异常诊断中心
            </h1>
          </Header>
          <Content className="p-0">
            <Routes>
              <Route path="/" element={<Navigate to="/exceptions" replace />} />
              <Route path="/exceptions" element={<ExceptionList />} />
              <Route path="/exceptions/:id" element={<ExceptionDetail />} />
            </Routes>
          </Content>
        </Layout>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
