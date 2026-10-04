import { defineHandler } from 'nitro'
import { handleHyper3dStatusRequest } from './hyper3d.post'

export default defineHandler(({ req }) => handleHyper3dStatusRequest(req))
