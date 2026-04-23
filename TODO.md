# Remove Login/Registration & Create GitHub PR

## Plan Steps

### 1. File Deletions & Core Changes ✅ [IN PROGRESS]
- [x] Create this TODO.md
- [x] Delete `src/pages/Auth.tsx`
- [x] Update `src/App.tsx` (remove Auth import, ProtectedRoute, /auth route, auth checks)
- [ ] Update `src/context/AppContext.tsx` (remove user/authLoading state/logic)
- [ ] Update `src/pages/Landing.tsx` (remove user checks/auth buttons)
- [ ] Update `src/integrations/supabase/client.ts` (remove auth mocks)
- [ ] Minor: Clean ChatPanel.tsx auth suggestions

### 2. Testing
- [ ] Run `bun run dev` (or npm/yarn), test direct access to `/` (Landing) and `/builder`
- [ ] Verify no redirects to /auth
- [ ] Test GitHub repo import on Landing

### 3. GitHub PR
- [ ] Check/install GitHub CLI (`gh`)
- [ ] `git checkout -b blackboxai/remove-auth`
- [ ] `git add . && git commit -m "Remove authentication/login/registration

Make app fully public"`
- [ ] `git push origin blackboxai/remove-auth`
- [ ] `gh pr create --title "Remove authentication" --body "Deletes login/registration, removes all auth checks. App now fully public."`

## Notes
- Auth was already mocked (no real backend).
- Preserved GitHub import functionality.
