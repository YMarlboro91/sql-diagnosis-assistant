import { SkillPackage, DiagnosisContext, DiagnosisResult, JstatEntry } from './SkillPackage.js';
import { Severity } from '../parser/LogEntry.js';

/**
 * JVM GC统计诊断技能包
 * 分析 jstat -gcutil 输出
 */
export class JstatSkill implements SkillPackage {
  name = 'jstat';
  displayName = 'GC统计诊断';
  supportedLogTypes = ['jstat*.txt', 'jstat*.log', 'gc*.txt'];
  priority = 70;

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { jstat, exception } = context;

    if (!jstat) {
      return results;
    }

    // 诊断1: GC内存区使用率
    if (jstat.gcUtilization && jstat.gcUtilization.length > 0) {
      for (const gc of jstat.gcUtilization) {
        const severity = gc.utilizationPercent > 90 ? 'HIGH' : gc.utilizationPercent > 70 ? 'MEDIUM' : 'LOW';

        results.push({
          skillPackage: this.name,
          diagnosisType: 'gc_region_usage',
          severity,
          title: `${gc.gcType} 使用率 ${gc.utilizationPercent.toFixed(1)}%`,
          description: `${gc.gcType} 区域内存使用统计`,
          details: {
            gcType: gc.gcType,
            utilizationPercent: gc.utilizationPercent,
            capacityBefore: gc.capacityBefore,
            capacityAfter: gc.capacityAfter,
            collectionCount: gc.collectionCount,
            collectionTime: gc.collectionTime ? `${gc.collectionTime}ms` : 'N/A'
          },
          suggestion: gc.utilizationPercent > 90
            ? `${gc.gcType}使用率超过90%，建议尽快进行GC或调整参数`
            : gc.utilizationPercent > 70
            ? `${gc.gcType}使用率偏高，建议关注`
            : `${gc.gcType}使用率正常`
        });
      }
    }

    // 诊断2: Full GC频率
    if (jstat.gcUtilization) {
      const metaspace = jstat.gcUtilization.find(g => /Metaspace|Class Space/i.test(g.gcType));
      if (metaspace && metaspace.utilizationPercent > 85) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'metaspace_pressure',
          severity: 'HIGH',
          title: 'Metaspace使用率过高',
          description: `Metaspace使用率 ${metaspace.utilizationPercent.toFixed(1)}%`,
          details: {
            utilizationPercent: metaspace.utilizationPercent
          },
          suggestion: 'Metaspace不足可能导致PermGen/Metaspace溢出，建议：1) 增加Metaspace大小 2) 减少类加载 3) 使用-XX:+CMSClassUnloadingEnabled'
        });
      }
    }

    // 诊断3: GC时间分析
    if (jstat.gcUtilization) {
      const gcWithTime = jstat.gcUtilization.filter(g => g.collectionTime && g.collectionCount);
      if (gcWithTime.length > 0) {
        const totalGcTime = gcWithTime.reduce((sum, g) => sum + (g.collectionTime || 0), 0);
        const totalGcCount = gcWithTime.reduce((sum, g) => sum + (g.collectionCount || 0), 0);

        if (totalGcTime > 10000) { // 总GC时间超过10秒
          results.push({
            skillPackage: this.name,
            diagnosisType: 'gc_time',
            severity: 'MEDIUM',
            title: `GC总时间过长 (${(totalGcTime / 1000).toFixed(1)}秒)`,
            description: `累计 ${totalGcCount} 次GC，总耗时 ${(totalGcTime / 1000).toFixed(1)} 秒`,
            details: {
              totalGcTime,
              totalGcCount,
              avgGcTime: totalGcCount > 0 ? (totalGcTime / totalGcCount).toFixed(1) : 0
            },
            suggestion: 'GC时间过长会严重影响服务响应，建议：1) 增加堆内存 2) 调整GC策略 3) 升级到G1/ZGC'
          });
        }
      }
    }

    // 诊断4: 类加载统计
    if (jstat.classStats) {
      const unloadRatio = jstat.classStats.卸载ClassCount / (jstat.classStats.loadedClassCount + jstat.classStats.卸载ClassCount);
      if (unloadRatio > 0.3) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'class_unloading',
          severity: 'LOW',
          title: '类卸载比例较高',
          description: `类加载: ${jstat.classStats.loadedClassCount}, 类卸载: ${jstat.classStats.卸载ClassCount}`,
          details: jstat.classStats,
          suggestion: '频繁的类卸载可能导致 metaspace 碎片化，建议监控 metaspace 使用趋势'
        });
      }
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    return context.jstat !== undefined;
  }
}
