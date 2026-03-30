import { SkillPackage, DiagnosisContext, DiagnosisResult, JmapEntry } from './SkillPackage.js';
import { Severity } from '../parser/LogEntry.js';

/**
 * JVM 堆内存诊断技能包
 * 分析 jmap -histo 输出
 */
export class JmapSkill implements SkillPackage {
  name = 'jmap';
  displayName = 'JVM堆内存诊断';
  supportedLogTypes = ['jmap*.txt', 'jmap*.log', 'heap*.txt'];
  priority = 80;

  analyze(context: DiagnosisContext): DiagnosisResult[] {
    const results: DiagnosisResult[] = [];
    const { jmap, exception } = context;

    if (!jmap) {
      return results;
    }

    // 诊断1: 堆内存使用率
    if (jmap.heapUsed && jmap.heapMax) {
      const usagePercent = (jmap.heapUsed / jmap.heapMax) * 100;
      const severity = usagePercent > 90 ? 'HIGH' : usagePercent > 70 ? 'MEDIUM' : 'LOW';

      results.push({
        skillPackage: this.name,
        diagnosisType: 'heap_usage',
        severity,
        title: `堆内存使用率 ${usagePercent.toFixed(1)}%`,
        description: `JVM堆使用: ${this.formatBytes(jmap.heapUsed)} / ${this.formatBytes(jmap.heapMax)}`,
        details: {
          heapUsed: jmap.heapUsed,
          heapMax: jmap.heapMax,
          usagePercent
        },
        suggestion: usagePercent > 90
          ? '堆内存使用率超过90%，建议立即进行GC或增加堆内存'
          : usagePercent > 70
          ? '堆内存使用率偏高，建议关注内存增长趋势'
          : '堆内存使用率正常'
      });
    }

    // 诊断2: 大对象分析
    if (jmap.objects && jmap.objects.length > 0) {
      // 按内存占用排序
      const topObjects = [...jmap.objects]
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 10);

      // 检查是否有异常大的对象
      const largeObjects = topObjects.filter(o => o.bytes > 100 * 1024 * 1024); // > 100MB
      if (largeObjects.length > 0) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'large_objects',
          severity: 'MEDIUM',
          title: '检测到大对象',
          description: `发现 ${largeObjects.length} 个超过100MB的对象`,
          details: {
            largeObjects: largeObjects.map(o => ({
              className: o.className,
              size: this.formatBytes(o.bytes),
              instances: o.instances
            }))
          },
          suggestion: '检查这些大对象的创建原因，可能是数据缓存或集合使用不当导致的'
        });
      }

      // 检查是否有大量小对象
      const totalInstances = jmap.objects.reduce((sum, o) => sum + o.instances, 0);
      const avgObjectSize = topObjects.reduce((sum, o) => sum + o.bytes, 0) / topObjects.length;
      if (totalInstances > 1000000 && avgObjectSize < 1024) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'object_bloat',
          severity: 'LOW',
          title: '存在大量小对象',
          description: `总计 ${totalInstances.toLocaleString()} 个对象，平均大小 ${avgObjectSize.toFixed(0)} bytes`,
          suggestion: '可能是字符串拼接、内部类或集合未正确清理导致的大量小对象'
        });
      }
    }

    // 诊断3: GC历史分析
    if (jmap.gcHistory && jmap.gcHistory.length > 0) {
      const recentGc = jmap.gcHistory.slice(-5);
      const fullGcCount = recentGc.filter(g => g.gcType.toLowerCase().includes('full')).length;

      if (fullGcCount >= 3) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'gc_pressure',
          severity: 'HIGH',
          title: '频繁Full GC',
          description: `最近5次GC中有 ${fullGcCount} 次Full GC`,
          details: {
            recentGc: recentGc.map(g => ({
              type: g.gcType,
              duration: g.duration ? `${g.duration}ms` : 'N/A'
            }))
          },
          suggestion: '频繁Full GC通常由内存不足或对象分配过快导致，建议：1) 增加堆内存 2) 优化对象创建 3) 检查GC参数配置'
        });
      }

      // 检查GC时间
      const gcWithDuration = recentGc.filter(g => g.duration);
      if (gcWithDuration.length > 0) {
        const avgDuration = gcWithDuration.reduce((sum, g) => sum + (g.duration || 0), 0) / gcWithDuration.length;
        if (avgDuration > 500) { // > 500ms
          results.push({
            skillPackage: this.name,
            diagnosisType: 'gc_slow',
            severity: 'MEDIUM',
            title: `GC暂停时间过长 (平均${avgDuration.toFixed(0)}ms)`,
            description: 'GC暂停时间过长会影响服务响应时间',
            suggestion: '建议：1) 增加堆内存 2) 调整GC算法(G1/ZGC) 3) 减少大对象创建'
          });
        }
      }
    }

    // 诊断4: 特定类分析
    if (jmap.objects) {
      const stringCount = jmap.objects.find(o => o.className === 'java.lang.String');
      if (stringCount && stringCount.instances > 1000000) {
        results.push({
          skillPackage: this.name,
          diagnosisType: 'string_bloat',
          severity: 'LOW',
          title: 'String对象过多',
          description: `发现 ${stringCount.instances.toLocaleString()} 个String对象，占用 ${this.formatBytes(stringCount.bytes)}`,
          suggestion: 'String对象过多可能是：1) 字符串拼接过度 2) 日志过多 3) 配置未正确缓存'
        });
      }

      // 检查集合类
      const collectionClasses = jmap.objects.filter(o =>
        /HashMap|ArrayList|LinkedList|HashSet/i.test(o.className)
      );
      if (collectionClasses.length > 0) {
        const collectionsByInstance = collectionClasses.sort((a, b) => b.instances - a.instances).slice(0, 3);
        results.push({
          skillPackage: this.name,
          diagnosisType: 'collection_usage',
          severity: 'LOW',
          title: '集合类使用情况',
          description: '常见集合类实例统计',
          details: {
            collections: collectionsByInstance.map(o => ({
              className: o.className,
              instances: o.instances.toLocaleString(),
              size: this.formatBytes(o.bytes)
            }))
          },
          suggestion: '如果某些集合持续增长，可能存在内存泄漏风险'
        });
      }
    }

    return results;
  }

  canAnalyze(context: DiagnosisContext): boolean {
    return context.jmap !== undefined;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }
}
