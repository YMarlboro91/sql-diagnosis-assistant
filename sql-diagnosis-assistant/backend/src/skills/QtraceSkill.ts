import { SkillPackage, DiagnosisContext, DiagnosisResult, QtraceEntry } from './SkillPackage.js';
import { Severity } from '../parser/LogEntry.js';

/**
 * 查询追踪诊断技能包
 * 分析 qtrace 输出
 */
export class QtraceSkill implements SkillPackage {
  name = 'qtrace';
  displayName = '查询追踪诊断';
  supportedLogTypes = ['qtrace*.json', 'qtrace*.log'];
  priority = 90;  // 高优先级，因为与查询最相关

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { qtrace, exception } = context;

    if (!qtrace) {
      return results;
    }

    // 诊断1: 查询总耗时
    if (qtrace.totalDuration) {
      const durationMs = qtrace.totalDuration;
      const durationSec = durationMs / 1000;
      const severity: Severity = durationSec > 60 ? 'HIGH' : durationSec > 10 ? 'MEDIUM' : 'LOW';

      results.push({
        skillPackage: this.name,
        diagnosisType: 'query_duration',
        severity,
        title: `查询总耗时 ${durationSec.toFixed(2)}秒`,
        description: `Query ${qtrace.queryId} 执行时间统计`,
        details: {
          queryId: qtrace.queryId,
          durationMs,
          startTime: qtrace.startTime,
          endTime: qtrace.endTime
        },
        suggestion: durationSec > 60
          ? '查询执行超过60秒，建议：1) 优化SQL 2) 增加索引 3) 分析数据量'
          : durationSec > 10
          ? '查询执行偏慢，建议检查执行计划'
          : '查询执行时间正常'
      });
    }

    // 诊断2: 各阶段耗时分析
    if (qtrace.stages && qtrace.stages.length > 0) {
      // 按耗时排序
      const sortedStages = [...qtrace.stages]
        .filter(s => s.duration)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0));

      // 找出耗时最长的阶段
      if (sortedStages.length > 0) {
        const slowestStage = sortedStages[0];
        const totalDuration = qtrace.totalDuration || qtrace.stages.reduce((sum, s) => sum + (s.duration || 0), 0);
        const percent = totalDuration > 0 ? ((slowestStage.duration || 0) / totalDuration * 100).toFixed(1) : '0';

        results.push({
          skillPackage: this.name,
          diagnosisType: 'slow_stage',
          severity: 'MEDIUM',
          title: `最耗时阶段: ${slowestStage.stageName}`,
          description: `耗时 ${((slowestStage.duration || 0) / 1000).toFixed(2)}秒 (占总耗时 ${percent}%)`,
          details: {
            stageName: slowestStage.stageName,
            durationMs: slowestStage.duration,
            percent,
            details: slowestStage.details
          },
          suggestion: `阶段 ${slowestStage.stageName} 是瓶颈，建议分析该阶段的详细执行计划`
        });
      }

      // 检查是否有异常长的阶段
      const longStages = sortedStages.filter(s => (s.duration || 0) > 30000); // > 30秒
      if (longStages.length > 0) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'stage_timeout',
          severity: 'HIGH',
          title: `检测到长耗时阶段 (${longStages.length}个)`,
          description: `${longStages.length} 个阶段执行时间超过30秒`,
          details: {
            stages: longStages.map(s => ({
              name: s.stageName,
              durationMs: s.duration
            }))
          },
          suggestion: '多个阶段执行时间过长，建议：1) 检查数据量 2) 分析执行计划 3) 检查系统负载'
        });
      }
    }

    // 诊断3: 错误检查
    if (qtrace.error) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'query_error',
        severity: 'HIGH',
        title: '查询执行出错',
        description: qtrace.error,
        details: {
          queryId: qtrace.queryId,
          error: qtrace.error
        },
        suggestion: '查询执行失败，建议根据错误信息检查SQL语法和执行条件'
      });
    }

    // 诊断4: 阶段数量异常
    if (qtrace.stages && qtrace.stages.length > 20) {
      results.push({
        skillPackage: this.name,
        diagnosisType: 'too_many_stages',
        severity: 'LOW',
        title: `执行阶段过多 (${qtrace.stages.length}个)`,
        description: '查询被拆分为过多执行阶段，可能影响性能',
        details: {
          stageCount: qtrace.stages.length,
          stages: qtrace.stages.map(s => s.stageName)
        },
        suggestion: '阶段过多可能导致任务调度开销增加，建议优化查询减少JOIN和子查询'
      });
    }

    // 诊断5: 数据倾斜迹象（通过stage详情判断）
    if (qtrace.stages) {
      const skewedStages = qtrace.stages.filter(s =>
        s.details && (
          s.details['skew'] ||
          s.details['dataSkew'] ||
          (s.details['outputRows'] && s.details['spilledRows'])
        )
      );

      if (skewedStages.length > 0) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'data_skew',
          severity: 'MEDIUM',
          title: '检测到数据倾斜',
          description: `${skewedStages.length} 个阶段存在数据倾斜`,
          details: {
            skewedStages: skewedStages.map(s => ({
              name: s.stageName,
              details: s.details
            }))
          },
          suggestion: '数据倾斜会导致部分任务执行时间过长，建议：1) 检查JOIN键分布 2) 考虑使用skew hint 3) 重新分区'
        });
      }
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    return context.qtrace !== undefined;
  }
}
