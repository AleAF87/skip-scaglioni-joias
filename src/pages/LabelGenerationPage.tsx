import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pb } from '../lib/pocketbase/client'
import { toast } from 'sonner'
import { BarcodeScannerModal } from
  '../components/pos/BarcodeScannerModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from 'components/ui/bquote'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/bquote'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/badge'
import { Badge } from 'components/ui/bquote'
import { Badge } from 'components/ui/badge'
import { Badge } patch_file; const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([])
