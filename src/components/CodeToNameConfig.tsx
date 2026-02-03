'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Plus, Trash2, Save, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface ConfigRow {
  id: string;
  tableEnName: string;        // 表英文名（必填）
  tableChineseName: string;   // 表中文名（非必填）
  tableAlias: string;         // 表别名（非必填）
  dimTableField: string;      // 维表关联字段（必填）
  mainTableField: string;     // 主表关联字段（必填）
  extraConditions: string;    // 额外关联条件（非必填，逗号分割）
  requireFields: string;      // 需求字段名（非必填，逗号分割）
}

interface CodeToNameConfigProps {
  onDataChange?: () => void;
}

export default function CodeToNameConfig({ onDataChange }: CodeToNameConfigProps) {
  const { success, error: toastError, warning } = useToast();
  
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ConfigRow>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从 localStorage 加载数据（添加错误处理）
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('codeToNameConfig');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        // 验证数据格式
        if (Array.isArray(parsed)) {
          setRows(parsed);
          console.log('✅ 成功加载码转名配置，数量:', parsed.length);
        } else {
          console.error('❌ 配置数据格式错误，应为数组');
          setRows([]);
        }
      }
    } catch (err) {
      console.error('❌ 加载码转名配置失败:', err);
      setRows([]);
    }
  }, []);

  // 保存数据到 localStorage（添加错误处理）
  useEffect(() => {
    try {
      localStorage.setItem('codeToNameConfig', JSON.stringify(rows));
      // 通知父组件数据已变化，触发 ExcelTab 的 INSERT 和 DWD 重新生成
      if (onDataChange) {
        onDataChange();
      }
    } catch (e) {
      console.error('❌ 保存码转名配置失败:', e);
      // 可以在这里添加用户提示，但目前只是记录日志
    }
  }, [rows, onDataChange]);

  const handleAddRow = () => {
    const newRow: ConfigRow = {
      id: Date.now().toString(),
      tableEnName: '',
      tableChineseName: '',
      tableAlias: '',
      dimTableField: '',
      mainTableField: '',
      extraConditions: '',
      requireFields: ''
    };
    setRows([...rows, newRow]);
    setEditingId(newRow.id);
    setEditFormData(newRow);
  };

  const handleEdit = (row: ConfigRow) => {
    setEditingId(row.id);
    setEditFormData({ ...row });
  };

  const handleSave = () => {
    if (!editFormData.tableEnName || !editFormData.dimTableField || !editFormData.mainTableField) {
      warning('请填写必填项：表英文名、维表关联字段、主表关联字段');
      return;
    }

    setRows(rows.map(row =>
      row.id === editingId ? { ...editFormData as ConfigRow, id: row.id } : row
    ));
    setEditingId(null);
    setEditFormData({});
    success('配置已保存');
  };

  const handleCancel = () => {
    // 如果是新行且未保存，则删除该行
    if (editFormData && editingId && !rows.find(r => r.id === editingId)?.tableEnName) {
      setRows(rows.filter(row => row.id !== editingId));
    }
    setEditingId(null);
    setEditFormData({});
  };

  const handleDelete = (id: string) => {
    setRows(rows.filter(row => row.id !== id));
    success('配置已删除');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        const importedRows: ConfigRow[] = jsonData.map((row, index) => ({
          id: Date.now().toString() + index,
          tableEnName: row['表英文名'] || row['tableEnName'] || '',
          tableChineseName: row['表中文名'] || row['tableChineseName'] || '',
          tableAlias: row['表别名'] || row['tableAlias'] || '',
          dimTableField: row['维表关联字段'] || row['dimTableField'] || '',
          mainTableField: row['主表关联字段'] || row['mainTableField'] || '',
          extraConditions: row['额外关联条件'] || row['extraConditions'] || '',
          requireFields: row['需求字段名'] || row['requireFields'] || ''
        }));

        setRows([...rows, ...importedRows]);
        success(`成功导入 ${importedRows.length} 条配置`);
      } catch (err) {
        toastError('导入失败，请确保文件格式正确');
        console.error(err);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    if (rows.length === 0) {
      warning('没有数据可以导出');
      return;
    }

    const exportData = rows.map(row => ({
      '表英文名': row.tableEnName,
      '表中文名': row.tableChineseName,
      '表别名': row.tableAlias,
      '维表关联字段': row.dimTableField,
      '主表关联字段': row.mainTableField,
      '额外关联条件': row.extraConditions,
      '需求字段名': row.requireFields
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '配置');

    XLSX.writeFile(wb, `码转名维表配置_${new Date().toLocaleDateString()}.xlsx`);
  };

  const isEditing = (id: string) => editingId === id;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>配置列表</CardTitle>
            <CardDescription>
              当前共有 {rows.length} 条配置
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAddRow} className="gap-2">
              <Plus className="w-4 h-4" />
              新增配置
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              导入Excel
            </Button>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              导出Excel
            </Button>
            {rows.length > 0 && (
              <Button
                onClick={() => {
                  setRows([]);
                  success('所有配置已清空');
                }}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                清空数据
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800">
              <TableRow>
                <TableHead className="w-12 text-center font-bold">#</TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[150px]">表英文名<span className="text-red-500">*</span></TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[120px]">表中文名</TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[120px]">表别名</TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[150px]">维表关联字段<span className="text-red-500">*</span></TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[150px]">主表关联字段<span className="text-red-500">*</span></TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[200px]">额外关联条件</TableHead>
                <TableHead className="font-bold whitespace-nowrap min-w-[200px]">需求字段名</TableHead>
                <TableHead className="w-48 text-center font-bold whitespace-nowrap">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">暂无配置</p>
                    <p className="text-sm">点击"新增配置"按钮添加第一条配置</p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="text-center font-medium text-slate-500">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.tableEnName || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, tableEnName: e.target.value })}
                          placeholder="表英文名"
                          className="min-w-[140px]"
                        />
                      ) : (
                        <span className="font-medium">{row.tableEnName || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.tableChineseName || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, tableChineseName: e.target.value })}
                          placeholder="表中文名"
                          className="min-w-[110px]"
                        />
                      ) : (
                        <span>{row.tableChineseName || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.tableAlias || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, tableAlias: e.target.value })}
                          placeholder="表别名"
                          className="min-w-[110px]"
                        />
                      ) : (
                        <span>{row.tableAlias || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.dimTableField || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, dimTableField: e.target.value })}
                          placeholder="维表关联字段"
                          className="min-w-[140px]"
                        />
                      ) : (
                        <span className="font-medium">{row.dimTableField || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.mainTableField || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, mainTableField: e.target.value })}
                          placeholder="主表关联字段"
                          className="min-w-[140px]"
                        />
                      ) : (
                        <span className="font-medium">{row.mainTableField || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.extraConditions || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, extraConditions: e.target.value })}
                          placeholder="额外关联条件，逗号分割"
                          className="min-w-[180px]"
                        />
                      ) : (
                        <span className="text-sm">{row.extraConditions || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing(row.id) ? (
                        <Input
                          value={editFormData.requireFields || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, requireFields: e.target.value })}
                          placeholder="需求字段名，逗号分割"
                          className="min-w-[180px]"
                        />
                      ) : (
                        <span className="text-sm">{row.requireFields || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-center">
                        {isEditing(row.id) ? (
                          <>
                            <Button
                              onClick={handleSave}
                              size="sm"
                              className="gap-1"
                            >
                              <Save className="w-3 h-3" />
                              保存
                            </Button>
                            <Button
                              onClick={handleCancel}
                              variant="outline"
                              size="sm"
                            >
                              取消
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              onClick={() => handleEdit(row)}
                              variant="outline"
                              size="sm"
                              className="gap-1"
                            >
                              <Save className="w-3 h-3" />
                              编辑
                            </Button>
                            <Button
                              onClick={() => handleDelete(row.id)}
                              variant="destructive"
                              size="sm"
                              className="gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              删除
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
