import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

// --- CONFIGURATION ---
const CLIENT_ID = '63738335462-r0lb1qthsh53djhc8lgu26dqei3078g0.apps.googleusercontent.com'; 
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
  "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest"
];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

interface TodoItem {
  task: string;
  status: string; // "Done" or "Pending"
  rowIndex: number;
}

const App = () => {
  const [user, setUser] = useState<boolean>(false);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [status, setStatus] = useState<string>('Initializing...');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [filter, setFilter] = useState<'All' | 'Done' | 'Not Done'>('All');
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    const startGapi = () => {
      window.gapi.client.init({
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
      }).then(() => setStatus('GAPI client ready'))
        .catch((err: any) => setStatus('Init Error: ' + JSON.stringify(err)));
    };

    const gapiScript = document.createElement('script');
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.onload = () => window.gapi.load('client', startGapi);
    document.body.appendChild(gapiScript);
  }, []);

  const handleAuth = () => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.access_token) {
          setUser(true);
          await processDriveFile();
        }
      },
    });
    tokenClient.requestAccessToken();
  };

  const processDriveFile = async () => {
    try {
      setStatus('Fetching todo_list.xls...');
      const listResponse = await window.gapi.client.drive.files.list({
        q: "name = 'todo_list.xls' and trashed = false",
        fields: 'files(id, name)',
      });

      let fileId = '';
      const files = listResponse.result.files || [];

      if (files.length === 0) {
        setStatus('Creating new file...');
        const createResponse = await window.gapi.client.drive.files.create({
          resource: {
            name: 'todo_list.xls',
            mimeType: 'application/vnd.google-apps.spreadsheet',
          },
          fields: 'id',
        } as any);
        fileId = createResponse.result.id!;
        await window.gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: fileId,
          range: 'Sheet1!A1:B2',
          valueInputOption: 'RAW',
          resource: { values: [['Task', 'Status'], ['First Task', 'Pending']] }
        });
      } else {
        fileId = files[0].id!;
      }

      setSpreadsheetId(fileId);
      loadData(fileId);
    } catch (error: any) {
      setStatus('API Error: ' + error.message);
    }
  };

  const loadData = async (id: string) => {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: 'Sheet1!A2:B',
    });
    const values = response.result.values || [];
    const formatted = values.map((row: string[], index: number) => ({
      task: row[0] || '',
      status: row[1] || 'Pending',
      rowIndex: index + 2, // 1-based, skipping header
    }));
    setTodoList(formatted);
    setStatus('Data Loaded');
  };

  const syncRow = async (item: TodoItem) => {
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `Sheet1!A${item.rowIndex}:B${item.rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[item.task, item.status]] }
    });
  };

  const toggleStatus = async (index: number) => {
    const newList = [...todoList];
    newList[index].status = newList[index].status === 'Done' ? 'Pending' : 'Done';
    setTodoList(newList);
    await syncRow(newList[index]);
  };

  const editTask = async (index: number, newText: string) => {
    const newList = [...todoList];
    newList[index].task = newText;
    setTodoList(newList);
  };

  const addTask = async () => {
    if (!newTask) return;
    const newItem = { task: newTask, status: 'Pending', rowIndex: todoList.length + 2 };
    const newList = [...todoList, newItem];
    setTodoList(newList);
    setNewTask('');
    await syncRow(newItem);
  };

  const filteredList = todoList.filter(item => {
    if (filter === 'Done') return item.status === 'Done';
    if (filter === 'Not Done') return item.status === 'Pending';
    return true;
  });

  return (
    <div className="container">
      <h1>Google Drive Todo</h1>
      <div style={{ padding: '10px', background: '#eee', marginBottom: '20px', borderRadius: '4px' }}>
        <strong>Status:</strong> {status}
      </div>

      {!user ? (
        <button onClick={handleAuth}>Login with Google</button>
      ) : (
        <div style={{ width: '100%', maxWidth: '500px', textAlign: 'left' }}>
          <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={newTask} 
              onChange={(e) => setNewTask(e.target.value)} 
              placeholder="Add new task..." 
              style={{ flex: 1, padding: '8px' }}
            />
            <button onClick={addTask} style={{ margin: 0 }}>Add</button>
          </div>

          <div style={{ marginBottom: '15px', display: 'flex', gap: '5px' }}>
            {(['All', 'Done', 'Not Done'] as const).map(f => (
              <button 
                key={f} 
                onClick={() => setFilter(f)}
                style={{ 
                  background: filter === f ? '#333' : '#ccc', 
                  fontSize: '12px', padding: '5px 10px' 
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ background: 'white', border: '1px solid #ddd', borderRadius: '4px' }}>
            {filteredList.map((item, idx) => (
              <div key={item.rowIndex} style={{ display: 'flex', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee' }}>
                <input 
                  type="checkbox" 
                  checked={item.status === 'Done'} 
                  onChange={() => toggleStatus(todoList.indexOf(item))}
                  style={{ marginRight: '10px' }}
                />
                <input 
                  type="text" 
                  value={item.task} 
                  onChange={(e) => editTask(todoList.indexOf(item), e.target.value)}
                  onBlur={() => syncRow(item)}
                  style={{ 
                    flex: 1, border: 'none', background: 'transparent',
                    textDecoration: item.status === 'Done' ? 'line-through' : 'none',
                    color: item.status === 'Done' ? '#888' : '#000'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
