import { defineConfig } from 'vitest/config'
import path from 'path'

// tsconfig.json의 "@/*" -> "./src/*" 별칭을 vitest 모듈 해석에도 그대로 반영한다.
// 이게 없으면 src/app/api/**/*.ts처럼 '@/lib/...'를 import하는 파일은 테스트에서
// 아예 로드되지 않는다 (tsc/next는 이 별칭을 알지만 vitest는 별도 설정이 필요).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
